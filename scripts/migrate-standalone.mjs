/**
 * Standalone 部署包内建迁移器(零依赖:只用 Node 内置模块 + 包里裁剪好的 better-sqlite3)
 *
 * 用法: node migrate.mjs
 *   环境变量 SQLITE_PATH 指定数据库文件(默认 ./data/apimock.db,相对包根目录)
 *
 * 设计:
 *   - 幂等,可反复执行;首次建表,后续只做增量(缺列补列、孤儿清理)
 *   - schema 以 src/lib/schema-sqlite.ts 为准(与 drizzle-kit push 同源),
 *     不跑 drizzle/*.sql(0000 是注释掉的 introspect 产物,001 假设旧表存在)
 *   - 每次改 schema 时同步更新本文件的 STATEMENTS / ensureColumn 列表
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

// 最终形态的建表语句(对应 src/lib/schema-sqlite.ts)
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    base_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    settings TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS endpoints (
    id TEXT PRIMARY KEY,
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
  `CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
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
  `CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
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
  `CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS endpoints_project_method_path_idx ON endpoints(project_id, method, path)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_idx ON projects(slug)`,
  `CREATE INDEX IF NOT EXISTS requests_endpoint_idx ON requests(endpoint_id)`,
  `CREATE INDEX IF NOT EXISTS requests_created_idx ON requests(created_at)`,
  `CREATE INDEX IF NOT EXISTS responses_endpoint_idx ON responses(endpoint_id)`,
];

// 老库(早期版本 migrate.ts 建的)缺列时补列,IF NOT EXISTS 建表覆盖不到存量表
function ensureColumn(table, column, ddl) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    console.log(`[migrate] ${table} 缺列 ${column},补列`);
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

console.log(`[migrate] db: ${dbPath}`);
for (const sql of STATEMENTS) sqlite.exec(sql);
ensureColumn('endpoints', 'is_shareable', `is_shareable INTEGER NOT NULL DEFAULT 1`);

// 0004_orphan_cleanup:清历史孤儿行(幂等,FK 开启前的存量数据修正)
sqlite.exec(`DELETE FROM endpoints WHERE project_id NOT IN (SELECT id FROM projects)`);
sqlite.exec(`DELETE FROM responses WHERE endpoint_id NOT IN (SELECT id FROM endpoints)`);
sqlite.exec(`DELETE FROM requests WHERE endpoint_id NOT IN (SELECT id FROM endpoints)`);

sqlite.close();
console.log('[migrate] done');
