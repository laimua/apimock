/**
 * SQLite schema parity 门禁
 *
 * 语义比对两条建库链路,防止 schema 漂移:
 *   A. drizzle-kit push(src/lib/schema-sqlite.ts 为准)
 *   B. scripts/migrate-standalone.mjs(standalone 部署包内建迁移器,手维护 DDL)
 *
 * 比对维度(语义,不做原始 DDL 全等):
 *   - table 集合(排除 sqlite_ 前缀系统表与 drizzle 元表)
 *   - PRAGMA table_xinfo:列名/类型/notnull/default/pk
 *   - PRAGMA foreign_key_list:外键(表/列/on_update/on_delete)
 *   - PRAGMA index_list + index_info:索引(唯一性/列序/origin;
 *     sqlite_autoindex_* 名随约束序号变化,按 origin+unique+列集比对)
 *   - 表属性:AUTOINCREMENT / STRICT / WITHOUT ROWID(normalized DDL 提取)
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
 */
export function extractSchema(db) {
  const tables = {};
  const rows = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .all();

  for (const { name, sql } of rows) {
    const columns = db
      .prepare(`PRAGMA table_xinfo(${JSON.stringify(name)})`)
      .all()
      .map((c) => ({
        name: c.name,
        type: normalizeType(c.type),
        notnull: c.notnull === 1,
        default: normalizeDefault(c.dflt_value),
        pk: c.pk,
      }));

    const fks = db
      .prepare(`PRAGMA foreign_key_list(${JSON.stringify(name)})`)
      .all()
      .map((f) => ({
        table: f.table,
        from: f.from,
        to: f.to,
        onUpdate: f.on_update,
        onDelete: f.on_delete,
      }))
      .sort((a, b) => `${a.from}|${a.to}|${a.table}`.localeCompare(`${b.from}|${b.to}|${b.table}`));

    const indexes = db
      .prepare(`PRAGMA index_list(${JSON.stringify(name)})`)
      .all()
      .map((idx) => {
        const cols = db
          .prepare(`PRAGMA index_info(${JSON.stringify(idx.name)})`)
          .all()
          .map((c) => c.name); // 表达式列 name 为 null → '?'
        // sqlite_autoindex_* 的名字由约束序号决定,同名不同义/同义不同名都会误报,
        // 改按 origin+unique+列集做 key(拼进 key 本身即完成比对)
        const isAuto = idx.name.startsWith('sqlite_autoindex_');
        const key = isAuto
          ? `auto:${idx.origin}:${idx.unique}:${cols.map((c) => c ?? '?').join(',')}`
          : `${idx.name}:${idx.origin}:${idx.unique}:${cols.map((c) => c ?? '?').join(',')}`;
        return { key, name: idx.name };
      });

    tables[name] = {
      columns,
      fks,
      indexes: indexes.map((i) => i.key).sort(),
      attrs: extractTableAttrs(sql),
    };
  }
  return tables;
}

/**
 * 语义比对两个 schema 描述,输出字段级可读差异行(空数组 = 一致)
 * @param {Record<string, ReturnType<typeof extractSchema>[string]>} a
 * @param {Record<string, ReturnType<typeof extractSchema>[string]>} b
 * @param {string} labelA A 侧标签
 * @param {string} labelB B 侧标签
 * @returns {string[]}
 */
export function diffSchemas(a, b, labelA = 'A(drizzle push)', labelB = 'B(migrate-standalone)') {
  const diffs = [];
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
        for (const field of ['type', 'notnull', 'default', 'pk']) {
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

    // 表属性比对
    for (const attr of ['autoincrement', 'strict', 'withoutRowid']) {
      if (ta.attrs[attr] !== tb.attrs[attr]) {
        diffs.push(
          `[table ${name}] 表属性 ${attr}: ${labelA}=${ta.attrs[attr]} / ${labelB}=${tb.attrs[attr]}`
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
  run('node', ['scripts/migrate-standalone.mjs'], { SQLITE_PATH: dbPath });
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
    diffs = diffSchemas(schemaA, schemaB);

    const tableCount = Object.keys(schemaA).length;
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
