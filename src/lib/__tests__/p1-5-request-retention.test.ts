/**
 * P1-5 验收测试:request-retention prune 对 endpoint_id=NULL 行的清理
 *
 * 报告问题(code-review P1-5):
 *  - mock 未命中写 recordRequest(null,...) → requests 表 endpoint_id=NULL 行
 *  - 旧 prune 自连接 ON r2.endpoint_id = r1.endpoint_id,SQL NULL=NULL 永假
 *  - 导致 NULL 行 COUNT 恒 0,永远排不进 keep 之后,prune 对 NULL 行永不删除
 *  - 与 P0-1 叠加形成持续写盘 DoS(存储单调无限增长)
 *
 * 修复:request-retention.ts ON 子句改为
 *   ON (r2.endpoint_id = r1.endpoint_id
 *       OR (r2.endpoint_id IS NULL AND r1.endpoint_id IS NULL))
 * 把所有 NULL 行归同一虚拟桶,与非 NULL 一样按 created_at 统一截断留 keep 条。
 *
 * 测试策略:用真实 better-sqlite3 + :memory: 库,直接跑修复后的 prune SQL
 * (从 request-retention.ts 抽出的同一段 SQL,保持逐字一致)。不 mock、不依赖
 * db-sqlite.ts 单例,完全独立验证 SQL 语义。SQLite/MySQL 两方言都支持
 * IS NULL / OR / 派生表(绕 MySQL 1093),这里覆盖 SQLite;MySQL 同语义。
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

/** 与 request-retention.ts 的 requests 表结构对齐的最小 DDL。 */
function createRequestsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE requests (
      id TEXT PRIMARY KEY NOT NULL,
      endpoint_id TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX requests_endpoint_idx ON requests(endpoint_id);
  `);
}

/**
 * 修复后的 prune SQL —— 与 src/lib/request-retention.ts 中 pruneOldRequests
 * 的 delete ... where id IN (...) 子查询逐字一致。keep 作为绑定参数。
 *
 * 直接对真实 SQLite 跑,验证 ON 子句带 NULL 归桶后 COUNT 语义正确。
 */
const PRUNE_SQL = `
  DELETE FROM requests
  WHERE id IN (
    SELECT id FROM (
      SELECT r1.id
      FROM requests r1
      LEFT JOIN requests r2
        ON (r2.endpoint_id = r1.endpoint_id
            OR (r2.endpoint_id IS NULL AND r1.endpoint_id IS NULL))
       AND (r2.created_at > r1.created_at
            OR (r2.created_at = r1.created_at AND r2.id > r1.id))
      GROUP BY r1.id
      HAVING COUNT(r2.id) >= ?
    ) to_delete
  )
`;

/**
 * 旧行为(修复前)的 prune SQL —— ON 子句无 NULL 归桶。仅用于复现 bug。
 */
const PRUNE_SQL_BUGGY = `
  DELETE FROM requests
  WHERE id IN (
    SELECT id FROM (
      SELECT r1.id
      FROM requests r1
      LEFT JOIN requests r2
        ON r2.endpoint_id = r1.endpoint_id
       AND (r2.created_at > r1.created_at
            OR (r2.created_at = r1.created_at AND r2.id > r1.id))
      GROUP BY r1.id
      HAVING COUNT(r2.id) >= ?
    ) to_delete
  )
`;

interface Row {
  id: string;
  endpoint_id: string | null;
  created_at: number;
}

function insertRows(db: Database.Database, rows: Row[]) {
  const stmt = db.prepare(
    'INSERT INTO requests (id, endpoint_id, method, path, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const tx = db.transaction((rs: Row[]) => {
    for (const r of rs) {
      stmt.run(r.id, r.endpoint_id, 'GET', '/x', r.created_at);
    }
  });
  tx(rows);
}

function countAll(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM requests').get() as { c: number }).c;
}

function remainingIds(db: Database.Database): string[] {
  const rows = db.prepare('SELECT id FROM requests ORDER BY id').all() as { id: string }[];
  return rows.map((r) => r.id);
}

describe('P1-5: request-retention prune NULL bucket', () => {
  it('bug 复现:旧 ON 子句对 NULL 行永不删除(COUNT 恒 0)', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    // 5 条 NULL endpoint 旧请求,keep=2 → 期望删 3 条最旧。旧逻辑删 0(复现 bug)
    insertRows(db, [
      { id: 'n1', endpoint_id: null, created_at: 100 },
      { id: 'n2', endpoint_id: null, created_at: 200 },
      { id: 'n3', endpoint_id: null, created_at: 300 },
      { id: 'n4', endpoint_id: null, created_at: 400 },
      { id: 'n5', endpoint_id: null, created_at: 500 },
    ]);
    db.prepare(PRUNE_SQL_BUGGY).run(2);
    // 旧行为:5 条全留(prune 对 NULL 行无效)
    expect(countAll(db)).toBe(5);
    db.close();
  });

  it('修复后:NULL 旧行按 created_at 截断,留最新 keep 条', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    insertRows(db, [
      { id: 'n1', endpoint_id: null, created_at: 100 },
      { id: 'n2', endpoint_id: null, created_at: 200 },
      { id: 'n3', endpoint_id: null, created_at: 300 },
      { id: 'n4', endpoint_id: null, created_at: 400 },
      { id: 'n5', endpoint_id: null, created_at: 500 },
    ]);
    db.prepare(PRUNE_SQL).run(2);
    // 留最近 2 条(n5, n4),删 3 条
    expect(countAll(db)).toBe(2);
    expect(remainingIds(db)).toEqual(['n4', 'n5']);
    db.close();
  });

  it('修复后:NULL 桶内 created_at 相同时按 id 降序作 tie-breaker', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    // 同 created_at,靠 id 排名。keep=1 应留 id 最大的 z3
    insertRows(db, [
      { id: 'z1', endpoint_id: null, created_at: 1000 },
      { id: 'z2', endpoint_id: null, created_at: 1000 },
      { id: 'z3', endpoint_id: null, created_at: 1000 },
    ]);
    db.prepare(PRUNE_SQL).run(1);
    expect(remainingIds(db)).toEqual(['z3']);
    db.close();
  });

  it('回归:非 NULL endpoint 保留逻辑不破', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    insertRows(db, [
      { id: 'e1a', endpoint_id: 'ep1', created_at: 100 },
      { id: 'e1b', endpoint_id: 'ep1', created_at: 200 },
      { id: 'e1c', endpoint_id: 'ep1', created_at: 300 },
      { id: 'e2a', endpoint_id: 'ep2', created_at: 100 },
      { id: 'e2b', endpoint_id: 'ep2', created_at: 200 },
    ]);
    db.prepare(PRUNE_SQL).run(1);
    // ep1 留 e1c,ep2 留 e2b
    expect(remainingIds(db).sort()).toEqual(['e1c', 'e2b']);
    db.close();
  });

  it('混合:NULL 与非 NULL 桶各自独立按 created_at 截断,互不干扰', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    insertRows(db, [
      { id: 'n1', endpoint_id: null, created_at: 100 },
      { id: 'n2', endpoint_id: null, created_at: 200 },
      { id: 'n3', endpoint_id: null, created_at: 300 },
      { id: 'e1', endpoint_id: 'ep1', created_at: 100 },
      { id: 'e2', endpoint_id: 'ep1', created_at: 200 },
      { id: 'e3', endpoint_id: 'ep1', created_at: 300 },
      { id: 'e4', endpoint_id: 'ep1', created_at: 400 },
    ]);
    db.prepare(PRUNE_SQL).run(1);
    // NULL 桶留 n3;ep1 桶留 e4
    expect(remainingIds(db).sort()).toEqual(['e4', 'n3']);
    db.close();
  });

  it('多 endpoint + NULL 桶:每个 endpoint 与 NULL 桶各自留 keep 条', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    insertRows(db, [
      { id: 'a1', endpoint_id: 'epA', created_at: 100 },
      { id: 'a2', endpoint_id: 'epA', created_at: 200 },
      { id: 'a3', endpoint_id: 'epA', created_at: 300 },
      { id: 'b1', endpoint_id: 'epB', created_at: 100 },
      { id: 'b2', endpoint_id: 'epB', created_at: 200 },
      { id: 'x1', endpoint_id: null, created_at: 100 },
      { id: 'x2', endpoint_id: null, created_at: 200 },
      { id: 'x3', endpoint_id: null, created_at: 300 },
    ]);
    db.prepare(PRUNE_SQL).run(1);
    // epA 留 a3,epB 留 b2,NULL 桶留 x3
    expect(remainingIds(db).sort()).toEqual(['a3', 'b2', 'x3']);
    db.close();
  });

  it('idempotent:连续跑两次 prune 结果一致(第二次删 0)', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    insertRows(db, [
      { id: 'n1', endpoint_id: null, created_at: 100 },
      { id: 'n2', endpoint_id: null, created_at: 200 },
      { id: 'n3', endpoint_id: null, created_at: 300 },
      { id: 'e1', endpoint_id: 'ep1', created_at: 100 },
      { id: 'e2', endpoint_id: 'ep1', created_at: 200 },
    ]);
    const r1 = db.prepare(PRUNE_SQL).run(1);
    const after1 = remainingIds(db).sort();
    const r2 = db.prepare(PRUNE_SQL).run(1);
    const after2 = remainingIds(db).sort();
    expect(after1).toEqual(['e2', 'n3']);
    expect(after2).toEqual(after1); // 第二次无新增删除
    expect(r2.changes).toBe(0);
    expect(r1.changes).toBe(3);
    db.close();
  });

  it('keep >= 行数:不删任何行(NULL 与非 NULL 都安全)', () => {
    const db = new Database(':memory:');
    createRequestsTable(db);
    insertRows(db, [
      { id: 'n1', endpoint_id: null, created_at: 100 },
      { id: 'e1', endpoint_id: 'ep1', created_at: 100 },
    ]);
    db.prepare(PRUNE_SQL).run(10);
    expect(countAll(db)).toBe(2);
    db.close();
  });
});
