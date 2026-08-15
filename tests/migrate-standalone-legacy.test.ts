/**
 * migrate-standalone 存量库升级测试(版本化迁移 v1)
 *
 * 验收标准(见 2026-08-15 round2 返工清单):
 * 1. 旧 DDL(id TEXT PRIMARY KEY,notnull=0)造库 + 塞数据 → 跑迁移 →
 *    id notnull=1、数据保留、缺列(is_shareable)补 default、FK/索引保留、
 *    最终 schema 与全新迁移库语义一致
 * 2. 再跑一次 → 幂等(数据不重复、schema 不变);user_version 达标后直接跳过迁移
 * 3. 拷数据失败(NULL id 违反新 NOT NULL)→ 回滚,旧 schema 与数据原样保留,
 *    且 user_version 仍为 0(失败路径不置位)
 * 4. 版本标记:迁移成功后 PRAGMA user_version 置位(与迁移代数对齐,v1 → 1)
 * 5. user_version 达标但 schema 是旧形态 → 非零退出报"人工检查",不静默跳过
 * 6. user_version > SCHEMA_VERSION → 非零退出拒绝降级,库与标记不动
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  extractSchema,
  diffSchemas,
} from '../scripts/check-sqlite-schema-parity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATE_SCRIPT = join('scripts', 'migrate-standalone.mjs');
const tmpDir = mkdtempSync(join(tmpdir(), 'migrate-legacy-'));

afterAll(() => {
  for (let i = 0; i < 3; i++) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
      break;
    } catch {
      // Windows 下句柄刚释放时 unlink 可能 EBUSY,重试几拍
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
});

function runMigrate(dbPath: string) {
  return spawnSync(process.execPath, [MIGRATE_SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, SQLITE_PATH: dbPath },
  });
}

/** PRAGMA table_info 行类型(better-sqlite3 对 PRAGMA 返回 unknown) */
interface TableInfoCol {
  name: string;
  notnull: number;
}

function tableInfo(db: Database.Database, table: string): TableInfoCol[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as TableInfoCol[];
}

/** 早期 migrate.ts 的旧 DDL:id 无 NOT NULL、endpoints 无 is_shareable */
const LEGACY_DDLS = [
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    base_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    settings TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE endpoints (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    name TEXT,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    delay_ms INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    status_code INTEGER DEFAULT 200,
    content_type TEXT DEFAULT 'application/json',
    response_body TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE responses (
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
  `CREATE UNIQUE INDEX endpoints_project_method_path_idx ON endpoints(project_id, method, path)`,
  `CREATE UNIQUE INDEX projects_slug_idx ON projects(slug)`,
];

function createLegacyDb(dbPath: string, extraSetup?: (db: Database.Database) => void) {
  const db = new Database(dbPath);
  for (const ddl of LEGACY_DDLS) db.exec(ddl);
  db.prepare(
    `INSERT INTO projects (id, name, slug, created_at, updated_at) VALUES ('p1', 'P1', 'p1-slug', 1, 1)`
  ).run();
  db.prepare(
    `INSERT INTO endpoints (id, project_id, path, method, created_at, updated_at)
     VALUES ('e1', 'p1', '/a', 'GET', 1, 1)`
  ).run();
  db.prepare(
    `INSERT INTO responses (id, endpoint_id, name, created_at, updated_at)
     VALUES ('r1', 'e1', 'default', 1, 1)`
  ).run();
  extraSetup?.(db);
  db.close();
}

describe('migrate-standalone 存量库升级(v1:id 补 NOT NULL)', () => {
  it('旧 DDL 库升级:notnull=1、数据保留、缺列补 default、schema 与全新库一致', () => {
    const legacyDb = join(tmpDir, 'legacy.db');
    const freshDb = join(tmpDir, 'fresh.db');
    createLegacyDb(legacyDb);

    const r = runMigrate(legacyDb);
    expect(r.status).toBe(0);

    const db = new Database(legacyDb);
    // 5 张表 id 全部 notnull=1
    for (const table of ['projects', 'endpoints', 'requests', 'responses', 'ai_providers']) {
      const idCol = tableInfo(db, table).find((c) => c.name === 'id');
      expect(idCol, table).toBeDefined();
      expect(idCol?.notnull, `${table}.id notnull`).toBe(1);
    }

    // 数据保留 + 重建期间新增列落 default
    expect(db.prepare('SELECT id, name FROM projects').all()).toEqual([
      { id: 'p1', name: 'P1' },
    ]);
    const endpoint = db
      .prepare('SELECT id, project_id, is_shareable FROM endpoints')
      .get() as { id: string; project_id: string; is_shareable: number };
    expect(endpoint).toEqual({ id: 'e1', project_id: 'p1', is_shareable: 1 });
    expect(db.prepare('SELECT id, endpoint_id FROM responses').all()).toEqual([
      { id: 'r1', endpoint_id: 'e1' },
    ]);

    // FK / 唯一索引保留
    const fks = db.prepare('PRAGMA foreign_key_list(responses)').all() as Array<{
      table: string;
      from: string;
    }>;
    expect(fks.some((f) => f.table === 'endpoints' && f.from === 'endpoint_id')).toBe(true);
    const idxNames = db.prepare('PRAGMA index_list(endpoints)').all() as Array<{ name: string }>;
    expect(idxNames.map((i) => i.name)).toContain('endpoints_project_method_path_idx');

    // 版本标记:升级后 user_version 置位为迁移代数(v1 → 1)
    expect(db.pragma('user_version', { simple: true })).toBe(1);

    // 升级库与全新迁移库 schema 语义一致
    const fresh = runMigrate(freshDb);
    expect(fresh.status).toBe(0);
    const freshConn = new Database(freshDb);
    const diffs = diffSchemas(extractSchema(db), extractSchema(freshConn));
    expect(diffs).toEqual([]);
    // 全新库同样置位
    expect(freshConn.pragma('user_version', { simple: true })).toBe(1);
    freshConn.close();
    db.close();
  }, 120_000);

  it('再跑一次:幂等,数据不重复、schema 不变', () => {
    const dbPath = join(tmpDir, 'idempotent.db');
    createLegacyDb(dbPath);
    expect(runMigrate(dbPath).status).toBe(0);

    const db = new Database(dbPath);
    const beforeSchema = JSON.stringify(extractSchema(db).tables);
    const beforeRows = {
      projects: db.prepare('SELECT COUNT(*) n FROM projects').get(),
      endpoints: db.prepare('SELECT COUNT(*) n FROM endpoints').get(),
      responses: db.prepare('SELECT COUNT(*) n FROM responses').get(),
    };
    db.close();

    const again = runMigrate(dbPath);
    expect(again.status).toBe(0);
    expect(again.stdout).not.toMatch(/重建表/);
    // 二跑:user_version 已达标,直接跳过整段迁移(输出跳过标记)
    expect(again.stdout).toMatch(/跳过/);
    expect(again.stdout).not.toMatch(/缺列/);

    const db2 = new Database(dbPath);
    // 跳过路径不改 user_version,仍为 1
    expect(db2.pragma('user_version', { simple: true })).toBe(1);
    expect(JSON.stringify(extractSchema(db2).tables)).toBe(beforeSchema);
    expect(db2.prepare('SELECT COUNT(*) n FROM projects').get()).toEqual(beforeRows.projects);
    expect(db2.prepare('SELECT COUNT(*) n FROM endpoints').get()).toEqual(beforeRows.endpoints);
    expect(db2.prepare('SELECT COUNT(*) n FROM responses').get()).toEqual(beforeRows.responses);
    db2.close();
  }, 120_000);

  it('拷数据失败(NULL id 违反新 NOT NULL)→ 回滚,旧 schema 与数据原样保留', () => {
    const dbPath = join(tmpDir, 'rollback.db');
    // 旧 schema 的 id 允许 NULL(SQLite TEXT PRIMARY KEY 历史坑)
    createLegacyDb(dbPath, (db) => {
      db.prepare(
        `INSERT INTO projects (id, name, slug, created_at, updated_at)
         VALUES (NULL, 'broken', 'broken-slug', 1, 1)`
      ).run();
    });

    const r = runMigrate(dbPath);
    expect(r.status).not.toBe(0);

    const db = new Database(dbPath);
    // 回滚:仍是旧 schema(notnull=0),数据未动(含 NULL id 行)
    const idCol = tableInfo(db, 'projects').find((c) => c.name === 'id');
    expect(idCol?.notnull).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) n FROM projects`).get()).toEqual({ n: 2 });
    expect(db.prepare(`SELECT COUNT(*) n FROM endpoints`).get()).toEqual({ n: 1 });
    // 无残留 __rebuild 临时表
    const leftovers = db
      .prepare("SELECT name FROM sqlite_master WHERE name LIKE '%__rebuild%'")
      .all();
    expect(leftovers).toEqual([]);
    // 迁移失败不走置位路径:版本标记仍为 0(不会被误标为已迁移)
    expect(db.pragma('user_version', { simple: true })).toBe(0);
    db.close();
  }, 120_000);

  it('user_version 达标但 schema 是旧形态(元数据/Schema 不一致)→ 非零退出报错,不静默跳过', () => {
    const dbPath = join(tmpDir, 'version-mismatch.db');
    // 旧 DDL(id 无 NOT NULL、无 is_shareable)却手动置 user_version=1(如被误设/半途写入)
    createLegacyDb(dbPath);
    {
      const db = new Database(dbPath);
      db.pragma('user_version = 1');
      db.close();
    }

    const r = runMigrate(dbPath);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/人工检查/);

    const db = new Database(dbPath);
    // 不动库:schema 仍是旧形态,标记不被"修复"也不被跳过掩盖
    const idCol = tableInfo(db, 'projects').find((c) => c.name === 'id');
    expect(idCol?.notnull).toBe(0);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    db.close();
  }, 120_000);

  it('user_version > SCHEMA_VERSION(库来自更新版本)→ 非零退出拒绝降级', () => {
    const dbPath = join(tmpDir, 'version-newer.db');
    // 全新库(或已迁移库)被更新版本的迁移器置位到 2
    expect(runMigrate(dbPath).status).toBe(0);
    {
      const db = new Database(dbPath);
      db.pragma('user_version = 2');
      db.close();
    }

    const r = runMigrate(dbPath);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/拒绝降级/);

    const db = new Database(dbPath);
    // 标记与数据均不动
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(db.prepare('SELECT COUNT(*) n FROM projects').get()).toEqual({ n: 0 });
    db.close();
  }, 120_000);
});
