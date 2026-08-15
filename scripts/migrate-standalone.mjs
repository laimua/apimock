/**
 * Standalone 部署包内建迁移器(零依赖:只用 Node 内置模块 + 包里裁剪好的 better-sqlite3)
 *
 * 用法: node migrate.mjs
 *   环境变量 SQLITE_PATH 指定数据库文件(默认 ./data/apimock.db,相对包根目录)
 *
 * 设计:
 *   - 幂等,可反复执行;首次建表,后续只做增量(缺列补列、孤儿清理、
 *     版本化迁移:存量库 id 列补 NOT NULL 的新表重建)
 *   - schema 以 src/lib/schema-sqlite.ts 为准(与 drizzle-kit push 同源),
 *     不跑 drizzle/*.sql(0000 是注释掉的 introspect 产物,001 假设旧表存在)
 *   - 每次改 schema 时同步更新本文件的 TABLE_DDLS / INDEX_DDLS / ensureColumn 列表
 *
 * 仅限 SQLite 栈;MySQL 部署请用仓库的 scripts/migrate.ts。
 */

import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

// standalone 的 file tracing 会把 better-sqlite3 拷到顶层 node_modules,但弄丢 pnpm 的
// 链接结构,导致其内部 require('bindings') 解析失败;优先用 .pnpm 布局里的真实包路径
function loadBetterSqlite3() {
  const nmDir = join(dirname(fileURLToPath(import.meta.url)), 'node_modules', '.pnpm');
  try {
    const entry = readdirSync(nmDir).find((d) => d.startsWith('better-sqlite3@'));
    if (entry) return require(join(nmDir, entry, 'node_modules', 'better-sqlite3'));
  } catch { /* 无 .pnpm 布局(npm 安装场景),走顶层解析 */ }
  return require('better-sqlite3');
}
const Database = loadBetterSqlite3();

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(pkgRoot, process.env.SQLITE_PATH || './data/apimock.db');
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

// 版本标记:与版本化迁移代数对齐。v1 = id 补 NOT NULL 重建 + is_shareable
// 补列 + 孤儿清理。启动先读 user_version,达标直接跳过整段迁移(建表/补列/
// 清孤儿全免);任一步失败抛错则不会走到置位,重跑即可恢复(幂等)。
const SCHEMA_VERSION = 1;

const currentVersion = sqlite.pragma('user_version', { simple: true });
if (currentVersion >= SCHEMA_VERSION) {
  console.log(
    `[migrate] user_version=${currentVersion} >= ${SCHEMA_VERSION},schema 已是最新,跳过迁移`
  );
  sqlite.close();
  console.log('[migrate] done');
  process.exit(0);
}

// 最终形态的建表语句(对应 src/lib/schema-sqlite.ts;
// 语义由 scripts/check-sqlite-schema-parity.mjs 门禁比对,改这里务必跑一遍)
const TABLE_DDLS = {
  projects: `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    base_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    settings TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  endpoints: `CREATE TABLE IF NOT EXISTS endpoints (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    name TEXT,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_shareable INTEGER NOT NULL DEFAULT 1,
    delay_ms INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    status_code INTEGER DEFAULT 200,
    content_type TEXT DEFAULT 'application/json',
    response_body TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  requests: `CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY NOT NULL,
    endpoint_id TEXT REFERENCES endpoints(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query TEXT,
    headers TEXT,
    body TEXT,
    response_status INTEGER,
    response_time INTEGER,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  )`,
  responses: `CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY NOT NULL,
    endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    name TEXT,
    description TEXT,
    status_code INTEGER NOT NULL DEFAULT 200,
    headers TEXT DEFAULT '{}',
    body TEXT,
    content_type TEXT DEFAULT 'application/json',
    match_rules TEXT DEFAULT '{}',
    is_default INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  ai_providers: `CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    base_url TEXT,
    api_key TEXT NOT NULL,
    models TEXT NOT NULL,
    default_model TEXT,
    system_prompt TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
};

const INDEX_DDLS = {
  endpoints: [
    `CREATE UNIQUE INDEX IF NOT EXISTS endpoints_project_method_path_idx ON endpoints(project_id, method, path)`,
  ],
  projects: [
    `CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_idx ON projects(slug)`,
    // 与 drizzle push 对齐:列级 .unique() 生成命名唯一索引(而非内联 UNIQUE 的
    // sqlite_autoindex),两条建库链路索引集合需一致(见 parity 门禁)
    `CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_unique ON projects(slug)`,
  ],
  requests: [
    `CREATE INDEX IF NOT EXISTS requests_endpoint_idx ON requests(endpoint_id)`,
    `CREATE INDEX IF NOT EXISTS requests_created_idx ON requests(created_at)`,
  ],
  responses: [
    `CREATE INDEX IF NOT EXISTS responses_endpoint_idx ON responses(endpoint_id)`,
  ],
};

const ALL_INDEX_DDLS = Object.values(INDEX_DDLS).flat();

// ============================================
// 存量库升级:旧 DDL 的 id TEXT PRIMARY KEY 没带 NOT NULL
// ============================================

/** 表是否存在 */
function tableExists(table) {
  return (
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table) !== undefined
  );
}

/** 旧 schema 检测:id 列存在但 notnull=0(TEXT PRIMARY KEY 历史坑) */
function needsIdRebuild(table) {
  const idCol = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .find((c) => c.name === 'id');
  return idCol !== undefined && idCol.notnull === 0;
}

/**
 * 新表重建(SQLite 官方 12 步的简化版):
 * foreign_keys=OFF + 事务内:建 __rebuild 新表(带 NOT NULL)→ 拷共有列数据 →
 * DROP 旧表(旧索引随表删除)→ rename → 重建索引。
 * 任一步失败 ROLLBACK,旧表/数据原样保留(幂等重跑即可恢复)。
 */
function rebuildTable(table) {
  console.log(`[migrate] ${table}: id 缺 NOT NULL(旧 schema),重建表`);
  const tempName = `${table}__rebuild`;
  const tempDdl = TABLE_DDLS[table]
    .replace('CREATE TABLE IF NOT EXISTS ', 'CREATE TABLE ')
    .replace(`CREATE TABLE ${table} (`, `CREATE TABLE ${tempName} (`);

  const fkWasOn = sqlite.pragma('foreign_keys', { simple: true }) === 1;
  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.exec('BEGIN');
    sqlite.exec(tempDdl);
    // 只拷两侧共有的列:老库缺的列(如 is_shareable)落新表 default
    const oldCols = sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    const newCols = sqlite.prepare(`PRAGMA table_info(${tempName})`).all().map((c) => c.name);
    const shared = newCols.filter((c) => oldCols.includes(c));
    sqlite.exec(
      `INSERT INTO ${tempName} (${shared.join(', ')}) SELECT ${shared.join(', ')} FROM ${table}`
    );
    // DROP 旧表会连带删除挂在旧表上的索引,随后按最终 DDL 重建
    sqlite.exec(`DROP TABLE ${table}`);
    sqlite.exec(`ALTER TABLE ${tempName} RENAME TO ${table}`);
    for (const ddl of INDEX_DDLS[table] ?? []) sqlite.exec(ddl);
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  } finally {
    sqlite.pragma(`foreign_keys = ${fkWasOn ? 'ON' : 'OFF'}`);
  }
}

// 老库(早期版本 migrate.ts 建的)缺列时补列,IF NOT EXISTS 建表覆盖不到存量表
function ensureColumn(table, column, ddl) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    console.log(`[migrate] ${table} 缺列 ${column},补列`);
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

console.log(`[migrate] db: ${dbPath}`);
for (const ddl of Object.values(TABLE_DDLS)) sqlite.exec(ddl);
for (const ddl of ALL_INDEX_DDLS) sqlite.exec(ddl);

// 版本化迁移 v1:存量库 id 列补 NOT NULL(CREATE IF NOT EXISTS 覆盖不到)
for (const table of Object.keys(TABLE_DDLS)) {
  if (tableExists(table) && needsIdRebuild(table)) rebuildTable(table);
}

ensureColumn('endpoints', 'is_shareable', `is_shareable INTEGER NOT NULL DEFAULT 1`);

// 0004_orphan_cleanup:清历史孤儿行(幂等,FK 开启前的存量数据修正)
sqlite.exec(`DELETE FROM endpoints WHERE project_id NOT IN (SELECT id FROM projects)`);
sqlite.exec(`DELETE FROM responses WHERE endpoint_id NOT IN (SELECT id FROM endpoints)`);
sqlite.exec(`DELETE FROM requests WHERE endpoint_id NOT IN (SELECT id FROM endpoints)`);

// 全部迁移步骤成功后置位版本标记(失败路径在上面已 throw,不会走到这里)
sqlite.pragma(`user_version = ${SCHEMA_VERSION}`);

sqlite.close();
console.log('[migrate] done');
