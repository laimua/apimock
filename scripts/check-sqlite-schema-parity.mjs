/**
 * SQLite schema parity 门禁
 *
 * 语义比对两条建库链路,防止 schema 漂移:
 *   A. drizzle-kit push(src/lib/schema-sqlite.ts 为准)
 *   B. scripts/migrate-standalone.mjs(standalone 部署包内建迁移器,手维护 DDL)
 *
 * 比对维度(语义,不做原始 DDL 全等):
 *   - table 集合(排除 sqlite_ 前缀系统表与 drizzle 元表)
 *   - PRAGMA table_xinfo:列名/类型/notnull/default/pk/generated(hidden:
 *     1=VIRTUAL 生成列,2=STORED 生成列)/生成表达式(DDL AS(...) 提取)/
 *     列 collation(DDL 提取)
 *   - PRAGMA foreign_key_list:按 id 分组、保留列序 seq(复合 FK 不漏检;
 *     表/列序/on_update/on_delete)
 *   - PRAGMA index_list + index_xinfo:索引(唯一性/origin/每列 desc/collation/
 *     表达式列原文(DDL 提取,非固定 '?expr')/partial WHERE 谓词;
 *     sqlite_autoindex_* 名随约束序号变化,按 origin+unique+列集比对)
 *   - CHECK constraint(normalized DDL 提取,表达式语义比对)
 *   - 表属性:AUTOINCREMENT / STRICT / WITHOUT ROWID(normalized DDL 提取)
 *   - view / trigger:名字集合 + normalized SQL
 *   - SQL 归一化:关键字/标识符小写化,字符串字面量原样保留
 *     ('ACTIVE' 与 'active' 不等价)
 *   - 覆盖防呆:两侧 schema 非空且包含已知 5 表(防"两边都空"通过)
 * 不比种子数据。
 *
 * 差异输出为对象+字段级可读文本(非 boolean);exit 1 = 有差异。
 *
 * 用法: node scripts/check-sqlite-schema-parity.mjs
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ============================================
// schema 提取(测试可复用)
// ============================================

/** 去引号 + 小写规范 default 值,便于语义比对 */
function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  let v = String(value).trim();
  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    v = v.slice(1, -1);
  }
  return v.toLowerCase();
}

function normalizeType(type) {
  return String(type ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeSql(sql) {
  return String(sql ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 语义小写:关键字/标识符小写化,单引号字符串字面量原样保留。
 * 直接 toLowerCase 整串会让 CHECK (x='ACTIVE') 与 ='active' 误判等价,
 * 故先把字面量替换为占位符再 lower,最后还原(支持 '' 转义)。
 */
function lowerKeepLiterals(s) {
  const literals = [];
  const replaced = String(s ?? '').replace(/'(?:[^']|'')*'/g, (m) => {
    literals.push(m);
    return `${literals.length - 1}`;
  });
  return replaced
    .toLowerCase()
    .replace(/(\d+)/g, (_, i) => literals[Number(i)]);
}

/**
 * 表达式语义归一化:在 lowerKeepLiterals 基础上再删掉字面量外的全部空白。
 * 用于 CHECK/生成表达式/索引表达式/WHERE 谓词 —— 这些是纯表达式,
 * 空白无语义(ABS( count ) 与 abs(count) 等价)。
 */
function normalizeExpr(s) {
  const literals = [];
  const replaced = String(s ?? '').replace(/'(?:[^']|'')*'/g, (m) => {
    literals.push(m);
    return `${literals.length - 1}`;
  });
  return replaced
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/(\d+)/g, (_, i) => literals[Number(i)]);
}

/** 从 openIdx 的 '(' 找到配对的 ')' 下标(找不到返回 -1) */
function findMatchingParen(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 按顶层逗号切分(括号内的逗号不切) */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** 列定义首 token(支持 "..." / `...` / [...] / 裸标识符),失败返回 null */
function parseIdentifier(def) {
  const m = def.match(/^"(?:[^"]|"")*"|^`[^`]+`|^\[[^\]]+\]|^[A-Za-z_][\w$]*/);
  if (!m) return null;
  const tok = m[0];
  if (tok.startsWith('"')) return tok.slice(1, -1).replace(/""/g, '"');
  if (tok.startsWith('`')) return tok.slice(1, -1);
  if (tok.startsWith('[')) return tok.slice(1, -1);
  return tok;
}

/** CREATE TABLE 列定义(排除 FOREIGN KEY/PRIMARY KEY/UNIQUE/CHECK/CONSTRAINT 表约束) */
function parseColumnDefs(sql) {
  const s = normalizeSql(sql);
  const open = s.indexOf('(');
  if (open === -1) return [];
  const close = findMatchingParen(s, open);
  if (close === -1) return [];
  return splitTopLevel(s.slice(open + 1, close)).filter(
    (d) => !/^(?:foreign\s+key|primary\s+key|unique|check|constraint)\b/i.test(d)
  );
}

/** 每列 collation(DDL COLLATE 子句;无则 null) */
function extractColumnCollations(sql) {
  const out = {};
  for (const def of parseColumnDefs(sql)) {
    const name = parseIdentifier(def);
    if (!name) continue;
    const m = def.match(/\bcollate\s+([A-Za-z_]\w*)/i);
    out[name] = m ? m[1].toLowerCase() : null;
  }
  return out;
}

/** CHECK constraint 表达式列表(列级 + 表级,normalized + 排序) */
function extractChecks(sql) {
  const s = normalizeSql(sql);
  const checks = [];
  const re = /\bcheck\s*\(/gi;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = findMatchingParen(s, start - 1);
    if (end === -1) break;
    checks.push(normalizeExpr(s.slice(start, end).trim()));
    re.lastIndex = end;
  }
  return checks.sort();
}

/** partial index 的 WHERE 谓词(sqlite_master 索引 DDL 提取;无则 null) */
function extractIndexWhere(db, indexName) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?")
    .get(indexName);
  const s = normalizeSql(row?.sql ?? '');
  if (!s) return null;
  const open = s.indexOf('(');
  const close = open === -1 ? -1 : findMatchingParen(s, open);
  if (close === -1) return null;
  const m = s
    .slice(close + 1)
    .trim()
    .match(/^where\s+(.+)$/i);
  return m ? normalizeExpr(m[1].trim()) : null;
}

/**
 * 索引 DDL 顶层列定义(sqlite_master 提取)。
 * 表达式索引列在 index_xinfo 里 name 为 null,固定记 '?expr' 会让
 * abs(count) 与 count+1 误判等价,故从 DDL 提取表达式原文参与比对;
 * 尾部 COLLATE/DESC/ASC 修饰已由 xinfo 的 coll/desc 单独覆盖,剥离之。
 */
function extractIndexColumnDefs(db, indexName) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?")
    .get(indexName);
  const s = normalizeSql(row?.sql ?? '');
  if (!s) return null;
  const open = s.indexOf('(');
  const close = open === -1 ? -1 : findMatchingParen(s, open);
  if (close === -1) return null;
  return splitTopLevel(s.slice(open + 1, close)).map((c) =>
    normalizeExpr(
      c.replace(/(\s+collate\s+\w+|\s+desc|\s+asc)+\s*$/gi, '').trim()
    )
  );
}

/** generated column 生成表达式(表 DDL 的 AS (...) 提取;非生成列返回 null) */
function extractColumnGenerations(sql) {
  const out = {};
  for (const def of parseColumnDefs(sql)) {
    const name = parseIdentifier(def);
    if (!name) continue;
    const m = def.match(/\b(?:generated\s+always\s+)?as\s*\(/i);
    if (!m) continue;
    const open = m.index + m[0].length - 1;
    const close = findMatchingParen(def, open);
    if (close !== -1) {
      out[name] = normalizeExpr(def.slice(open + 1, close).trim());
    }
  }
  return out;
}

/** 表属性:AUTOINCREMENT/STRICT/WITHOUT ROWID(normalized DDL 提取) */
function extractTableAttrs(sql) {
  const s = (sql ?? '').replace(/\s+/g, ' ');
  return {
    autoincrement: /\bautoincrement\b/i.test(s),
    strict: /\bstrict\b/i.test(s),
    withoutRowid: /\bwithout\s+rowid\b/i.test(s),
  };
}

/**
 * 从 better-sqlite3 连接提取规范化 schema 描述
 * @param {import('better-sqlite3').Database} db
 * @returns {{ tables: Record<string, object>, views: Record<string, string>, triggers: Record<string, string> }}
 */
export function extractSchema(db) {
  const tables = {};
  const views = {};
  const triggers = {};
  const rows = db
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
    )
    .all();

  for (const { type, name, sql } of rows) {
    if (type === 'view' || type === 'trigger') {
      const target = type === 'view' ? views : triggers;
      target[name] = lowerKeepLiterals(normalizeSql(sql));
    }
  }

  for (const { name, sql } of rows.filter((r) => r.type === 'table')) {
    const collations = extractColumnCollations(sql);
    const generations = extractColumnGenerations(sql);
    const columns = db
      .prepare(`PRAGMA table_xinfo(${JSON.stringify(name)})`)
      .all()
      .map((c) => ({
        name: c.name,
        type: normalizeType(c.type),
        notnull: c.notnull === 1,
        default: normalizeDefault(c.dflt_value),
        pk: c.pk,
        // hidden: 0=普通列,1=VIRTUAL 生成列,2=STORED 生成列
        hidden: c.hidden,
        collate: collations[c.name] ?? null,
        // 生成表达式:仅 hidden>0 参与(普通列恒 null);提取失败记 '?expr' 防漏检
        generated: c.hidden > 0 ? (generations[c.name] ?? '?expr') : null,
      }));

    // FK 按 id 分组、组内保留 seq 列序:复合 FK 的 (a,b) 与 (b,a)、
    // 复合与两个单列 FK 才能区分,不会漏检
    const fkRows = db
      .prepare(`PRAGMA foreign_key_list(${JSON.stringify(name)})`)
      .all()
      .sort((a, b) => a.id - b.id || a.seq - b.seq);
    const fkGroups = new Map();
    for (const f of fkRows) {
      let g = fkGroups.get(f.id);
      if (!g) {
        g = { table: f.table, from: [], to: [], onUpdate: f.on_update, onDelete: f.on_delete };
        fkGroups.set(f.id, g);
      }
      g.from.push(f.from);
      g.to.push(f.to ?? '');
    }
    const fks = [...fkGroups.values()]
      .map((g) => ({
        table: g.table,
        from: g.from.join(','),
        to: g.to.join(','),
        onUpdate: g.onUpdate,
        onDelete: g.onDelete,
      }))
      .sort(
        (a, b) =>
          `${a.from}|${a.to}|${a.table}`.localeCompare(`${b.from}|${b.to}|${b.table}`)
      );

    const indexes = db
      .prepare(`PRAGMA index_list(${JSON.stringify(name)})`)
      .all()
      .map((idx) => {
        // index_xinfo:每列 seqno/desc/collation;表达式列 name 为 null,
        // 从索引 DDL 提取表达式原文(按序号对位)参与比对
        const xcols = db
          .prepare(`PRAGMA index_xinfo(${JSON.stringify(idx.name)})`)
          .all()
          .filter((c) => c.key === 1)
          .sort((a, b) => a.seqno - b.seqno);
        const ddlCols = xcols.some((c) => c.name === null)
          ? extractIndexColumnDefs(db, idx.name)
          : null;
        const cols = xcols.map(
          (c, i) => `${c.name ?? ddlCols?.[i] ?? '?expr'}:${c.desc === 1 ? 'desc' : 'asc'}:${c.coll}`
        );
        // partial 索引的 WHERE 谓词(autoindex 不可能是 partial,sql 为 null)
        const where = idx.partial === 1 ? extractIndexWhere(db, idx.name) : null;
        // sqlite_autoindex_* 的名字由约束序号决定,同名不同义/同义不同名都会误报,
        // 改按 origin+unique+列集做 key(拼进 key 本身即完成比对)
        const isAuto = idx.name.startsWith('sqlite_autoindex_');
        return `${
          isAuto ? 'auto' : idx.name
        }:${idx.origin}:${idx.unique}:${where ?? '-'}:${cols.join(',')}`;
      })
      .sort();

    tables[name] = {
      columns,
      fks,
      indexes,
      checks: extractChecks(sql),
      attrs: extractTableAttrs(sql),
    };
  }
  return { tables, views, triggers };
}

/** parity 门禁必须覆盖的表(防"两边都空"通过) */
export const REQUIRED_TABLES = [
  'projects',
  'endpoints',
  'requests',
  'responses',
  'ai_providers',
];

/**
 * 覆盖防呆:两侧 schema 非空且包含已知 5 表
 * @param {Record<string, object>} tables
 * @param {string} label
 * @returns {string[]}
 */
export function validateSchemaCoverage(tables, label) {
  const errors = [];
  const names = Object.keys(tables);
  if (names.length === 0) {
    errors.push(`[coverage] ${label}: schema 为空(建库链路可能静默失败)`);
    return errors;
  }
  for (const t of REQUIRED_TABLES) {
    if (!(t in tables)) {
      errors.push(`[coverage] ${label}: 缺少已知表 ${t}`);
    }
  }
  return errors;
}

/**
 * 语义比对两个 schema 描述,输出字段级可读差异行(空数组 = 一致)
 * @param {{ tables: Record<string, object>, views: Record<string, string>, triggers: Record<string, string> }} sa
 * @param {{ tables: Record<string, object>, views: Record<string, string>, triggers: Record<string, string> }} sb
 * @param {string} labelA A 侧标签
 * @param {string} labelB B 侧标签
 * @returns {string[]}
 */
export function diffSchemas(sa, sb, labelA = 'A(drizzle push)', labelB = 'B(migrate-standalone)') {
  const diffs = [];
  const a = sa.tables ?? sa;
  const b = sb.tables ?? sb;
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

  for (const name of names) {
    const ta = a[name];
    const tb = b[name];
    if (!ta) {
      diffs.push(`[table ${name}] 仅存在于 ${labelA}`);
      continue;
    }
    if (!tb) {
      diffs.push(`[table ${name}] 仅存在于 ${labelB}`);
      continue;
    }

    // 列比对
    const colA = new Map(ta.columns.map((c) => [c.name, c]));
    const colB = new Map(tb.columns.map((c) => [c.name, c]));
    for (const col of [...new Set([...colA.keys(), ...colB.keys()])].sort()) {
      const ca = colA.get(col);
      const cb = colB.get(col);
      if (!ca) {
        diffs.push(`[table ${name}] 列 ${col}: 仅存在于 ${labelB}`);
      } else if (!cb) {
        diffs.push(`[table ${name}] 列 ${col}: 仅存在于 ${labelA}`);
      } else {
        for (const field of ['type', 'notnull', 'default', 'pk', 'hidden', 'collate', 'generated']) {
          if (String(ca[field]) !== String(cb[field])) {
            diffs.push(
              `[table ${name}] 列 ${col}.${field}: ${labelA}=${JSON.stringify(ca[field])} / ${labelB}=${JSON.stringify(cb[field])}`
            );
          }
        }
      }
    }

    // 外键比对
    const fkA = JSON.stringify(ta.fks);
    const fkB = JSON.stringify(tb.fks);
    if (fkA !== fkB) {
      diffs.push(`[table ${name}] 外键差异:\n    ${labelA}: ${fkA}\n    ${labelB}: ${fkB}`);
    }

    // 索引比对
    const idxA = ta.indexes.join('\n');
    const idxB = tb.indexes.join('\n');
    if (idxA !== idxB) {
      const onlyA = ta.indexes.filter((i) => !tb.indexes.includes(i));
      const onlyB = tb.indexes.filter((i) => !ta.indexes.includes(i));
      diffs.push(
        `[table ${name}] 索引差异:` +
          (onlyA.length ? `\n    仅 ${labelA}: ${onlyA.join(' | ')}` : '') +
          (onlyB.length ? `\n    仅 ${labelB}: ${onlyB.join(' | ')}` : '')
      );
    }

    // CHECK constraint 比对
    const ckA = JSON.stringify(ta.checks);
    const ckB = JSON.stringify(tb.checks);
    if (ckA !== ckB) {
      diffs.push(`[table ${name}] CHECK 差异:\n    ${labelA}: ${ckA}\n    ${labelB}: ${ckB}`);
    }

    // 表属性比对
    for (const attr of ['autoincrement', 'strict', 'withoutRowid']) {
      if (ta.attrs[attr] !== tb.attrs[attr]) {
        diffs.push(
          `[table ${name}] 表属性 ${attr}: ${labelA}=${ta.attrs[attr]} / ${labelB}=${tb.attrs[attr]}`
        );
      }
    }
  }

  // view / trigger 比对(名字集合 + normalized SQL)
  for (const kind of ['views', 'triggers']) {
    const va = sa[kind] ?? {};
    const vb = sb[kind] ?? {};
    const label = kind === 'views' ? 'view' : 'trigger';
    for (const name of [...new Set([...Object.keys(va), ...Object.keys(vb)])].sort()) {
      if (!(name in va)) {
        diffs.push(`[${label} ${name}] 仅存在于 ${labelB}`);
      } else if (!(name in vb)) {
        diffs.push(`[${label} ${name}] 仅存在于 ${labelA}`);
      } else if (va[name] !== vb[name]) {
        diffs.push(
          `[${label} ${name}] SQL 差异:\n    ${labelA}: ${va[name]}\n    ${labelB}: ${vb[name]}`
        );
      }
    }
  }
  return diffs;
}

// ============================================
// 建库链路
// ============================================

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0 || r.error) {
    throw new Error(
      `${cmd} ${args.join(' ')} 失败 (exit ${r.status}):\n${r.stdout ?? ''}\n${r.stderr ?? ''}`
    );
  }
  return r;
}

function buildViaDrizzlePush(dbPath) {
  // 用 node 直接跑 drizzle-kit 的 bin(避免 npx/pnpm exec 的跨平台 shell 差异)
  const drizzleKitBin = join(REPO_ROOT, 'node_modules', 'drizzle-kit', 'bin.cjs');
  run(process.execPath, [
    drizzleKitBin, 'push',
    '--dialect', 'sqlite',
    '--schema', 'src/lib/schema-sqlite.ts',
    '--url', pathToFileURL(dbPath).href,
    '--force',
  ]);
}

function buildViaMigrateStandalone(dbPath) {
  // 用 process.execPath 而非裸 'node':PATH 上的 node 版本可能与当前进程
  // 不一致(本地 nvm 多版本),导致 better-sqlite3 原生模块 ABI 不匹配
  run(process.execPath, ['scripts/migrate-standalone.mjs'], { SQLITE_PATH: dbPath });
}

// ============================================
// main(直接执行时;被 vitest import 时不跑)
// ============================================

const isMain =
  process.argv[1] &&
  resolve(process.argv[1].toLowerCase()) === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'apimock-parity-'));
  let diffs;
  try {
    const dbA = join(tmpDir, 'drizzle-push.db');
    const dbB = join(tmpDir, 'migrate-standalone.db');
    console.log('[parity] 建库 A: drizzle-kit push(schema-sqlite.ts)');
    buildViaDrizzlePush(dbA);
    console.log('[parity] 建库 B: migrate-standalone.mjs');
    buildViaMigrateStandalone(dbB);

    const dbAConn = new Database(dbA);
    const dbBConn = new Database(dbB);
    const schemaA = extractSchema(dbAConn);
    const schemaB = extractSchema(dbBConn);
    dbAConn.close();
    dbBConn.close();
    // 覆盖防呆:非空 + 已知 5 表(防"两边都空"通过)
    diffs = [
      ...validateSchemaCoverage(schemaA.tables, 'A(drizzle push)'),
      ...validateSchemaCoverage(schemaB.tables, 'B(migrate-standalone)'),
      ...diffSchemas(schemaA, schemaB),
    ];

    const tableCount = Object.keys(schemaA.tables).length;
    if (diffs.length === 0) {
      console.log(`[parity] OK — ${tableCount} 张表语义一致`);
    } else {
      console.error(`[parity] FAIL — 发现 ${diffs.length} 处差异:`);
      for (const d of diffs) console.error(`  - ${d}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`[parity] FAIL — ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  } finally {
    // Windows 下文件句柄刚释放时 unlink 可能 EBUSY,重试几拍(同步等待)
    for (let i = 0; i < 3; i++) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
        break;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
  }
}
