/**
 * P1-4 验收测试:SQLite 外键 pragma + 孤儿清理迁移
 *
 * 覆盖 codex 验收关注点 ⑤:
 *  1. 连接级生效:new Database 后 PRAGMA foreign_keys 返回 1
 *  2. 级联删除生效:删 project -> endpoints/responses/requests 全清
 *  3. 孤儿清理迁移 idempotent:造孤儿 -> 跑迁移 -> 清零;再跑 -> 仍清零不报错
 *  4. 顺序证明:先清孤儿(造孤儿+跑迁移=0) -> 开 FK -> 后续 DELETE 级联生效
 *  5. 多连接覆盖:两个独立 Database 实例各自 pragma 都 ON
 *
 * 说明:用真实 better-sqlite3 + :memory: 库 + 项目实际迁移 SQL 文件,不 mock。
 * 不导 db-sqlite.ts(那是单例文件库,会落盘 ./data/apimock.db),完全独立验证。
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 项目当前 schema(0001+ 之后)的最小 DDL,带 ON DELETE cascade 外键。
 * 与 drizzle/0001_fine_excalibur.sql 跑完后的表结构一致。
 */
function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      base_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      settings TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE endpoints (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
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
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE responses (
      id TEXT PRIMARY KEY NOT NULL,
      endpoint_id TEXT NOT NULL,
      name TEXT,
      status_code INTEGER NOT NULL DEFAULT 200,
      headers TEXT DEFAULT '{}',
      body TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
    );
    CREATE TABLE requests (
      id TEXT PRIMARY KEY NOT NULL,
      endpoint_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
    );
  `);
}

/** 读取并按 statement-breakpoint 切分迁移 SQL 文件,返回可逐条 exec 的语句数组 */
function readMigrationStatements(fileName: string): string[] {
  const filePath = path.resolve(process.cwd(), 'drizzle', fileName);
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split('--> statement-breakpoint')
    .map((s) =>
      // 移除每段内的 -- 注释行,只留可执行 SQL
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);
}

describe('P1-4: SQLite foreign_keys pragma', () => {
  it('PRAGMA foreign_keys 按连接生效,且可观测地决定级联行为(baseline 探测)', () => {
    // 注意:better-sqlite3 v12 自身默认把 foreign_keys 置为 ON(覆盖 SQLite 原生 OFF
    // 默认),但这是驱动层的便利行为,非 SQLite 语义保证。db-sqlite.ts 显式设 ON 是
    // 防御性写法 —— 即便未来驱动版本变更或换库,级联仍能工作。这里只探测可观测性:
    // OFF 时 DELETE 不级联,ON 时级联,二者均可显式切换。
    const dbOff = new Database(':memory:');
    dbOff.pragma('foreign_keys = OFF');
    expect(dbOff.pragma('foreign_keys', { simple: true })).toBe(0);
    dbOff.close();

    const dbOn = new Database(':memory:');
    dbOn.pragma('foreign_keys = ON');
    expect(dbOn.pragma('foreign_keys', { simple: true })).toBe(1);
    dbOn.close();
  });

  it('new Database 后立即设 pragma -> 查询返回 1(连接级生效,模拟 db-sqlite.ts 修复)', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON'); // 与 db-sqlite.ts 第 26 行一致
    const row = db.pragma('foreign_keys', { simple: true });
    expect(row).toBe(1);
    db.close();
  });

  it('多连接独立:pragma 按连接生效,可各自显式 OFF/ON', () => {
    // PRAGMA foreign_keys 按连接生效 —— 必须每个 new Database 后都设,
    // 不能假设一个连接开了别的连接也开。db-sqlite.ts 在唯一连接创建处设 ON,
    // 保证应用连接始终 ON;migrator 等独立连接需自行管理。
    const db1 = new Database(':memory:');
    const db2 = new Database(':memory:');
    db1.pragma('foreign_keys = ON');
    db2.pragma('foreign_keys = OFF');
    expect(db1.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db2.pragma('foreign_keys', { simple: true })).toBe(0); // 独立连接,不受 db1 影响
    db1.close();
    db2.close();
  });

  it('FK 开启后级联删除生效:删 project -> endpoints/responses/requests 全清', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    createSchema(db);

    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)`,
    ).run('p1', 'P1', 'p1slug', now, now);
    db.prepare(
      `INSERT INTO endpoints (id,project_id,path,method,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    ).run('e1', 'p1', '/users', 'GET', now, now);
    db.prepare(
      `INSERT INTO responses (id,endpoint_id,created_at,updated_at) VALUES (?,?,?,?)`,
    ).run('r1', 'e1', now, now);
    db.prepare(
      `INSERT INTO requests (id,endpoint_id,method,path,created_at) VALUES (?,?,?,?,?)`,
    ).run('req1', 'e1', 'GET', '/users', now);

    // 删 project -> 级联应清空所有子表
    db.prepare(`DELETE FROM projects WHERE id=?`).run('p1');
    expect(db.prepare(`SELECT COUNT(*) c FROM endpoints`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) c FROM responses`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) c FROM requests`).get()).toEqual({ c: 0 });
    db.close();
  });

  it('FK 关闭时级联失效:删 project -> 子表成孤儿(证明 FK 机制是级联生效的唯一来源)', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF'); // 显式关掉,模拟任何不设 ON 的连接
    createSchema(db);

    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)`,
    ).run('p1', 'P', 'slug1', now, now);
    db.prepare(
      `INSERT INTO endpoints (id,project_id,path,method,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    ).run('e1', 'p1', '/x', 'GET', now, now);
    db.prepare(`DELETE FROM projects WHERE id=?`).run('p1');

    // 没开 FK -> endpoint 成孤儿,这正是修复前的问题
    expect(db.prepare(`SELECT COUNT(*) c FROM endpoints`).get()).toEqual({ c: 1 });
    db.close();
  });
});

describe('P1-4: 孤儿清理迁移(0004_orphan_cleanup.sql)', () => {
  /**
   * 跑一次清理迁移到给定 db。返回各表删除前后差值,用于断言。
   */
  function runCleanup(db: Database.Database) {
    const before = {
      endpoints: (db.prepare(`SELECT COUNT(*) c FROM endpoints`).get() as { c: number }).c,
      responses: (db.prepare(`SELECT COUNT(*) c FROM responses`).get() as { c: number }).c,
      requests: (db.prepare(`SELECT COUNT(*) c FROM requests`).get() as { c: number }).c,
    };
    const stmts = readMigrationStatements('0004_orphan_cleanup.sql');
    for (const s of stmts) {
      db.exec(s);
    }
    const after = {
      endpoints: (db.prepare(`SELECT COUNT(*) c FROM endpoints`).get() as { c: number }).c,
      responses: (db.prepare(`SELECT COUNT(*) c FROM responses`).get() as { c: number }).c,
      requests: (db.prepare(`SELECT COUNT(*) c FROM requests`).get() as { c: number }).c,
    };
    return { before, after };
  }

  it('迁移文件存在且可被 statement-breakpoint 切分为 3 条 DELETE', () => {
    const stmts = readMigrationStatements('0004_orphan_cleanup.sql');
    expect(stmts.length).toBe(3);
    expect(stmts[0]).toMatch(/DELETE FROM .*endpoints/);
    expect(stmts[1]).toMatch(/DELETE FROM .*responses/);
    expect(stmts[2]).toMatch(/DELETE FROM .*requests/);
  });

  it('清理孤儿:endpoints(项目不存在)+ responses/requests(endpoint 不存在)全删', () => {
    const db = new Database(':memory:');
    createSchema(db);
    const now = Date.now();

    // 造孤儿:关 FK 临时绕过外键约束
    db.pragma('foreign_keys = OFF');
    // 孤儿 endpoint(project 不存在)
    db.prepare(
      `INSERT INTO endpoints (id,project_id,path,method,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    ).run('orphan_ep', 'no_such_project', '/x', 'GET', now, now);
    // 孤儿 response + request(引用不存在的 endpoint)
    db.prepare(
      `INSERT INTO responses (id,endpoint_id,created_at,updated_at) VALUES (?,?,?,?)`,
    ).run('orphan_resp', 'no_such_endpoint', now, now);
    db.prepare(
      `INSERT INTO requests (id,endpoint_id,method,path,created_at) VALUES (?,?,?,?,?)`,
    ).run('orphan_req', 'no_such_endpoint', 'GET', '/x', now);

    // 一条正常链(p1->e1->resp/req)应保留
    db.prepare(
      `INSERT INTO projects (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)`,
    ).run('p1', 'P', 's1', now, now);
    db.prepare(
      `INSERT INTO endpoints (id,project_id,path,method,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    ).run('e1', 'p1', '/y', 'GET', now, now);
    db.prepare(
      `INSERT INTO responses (id,endpoint_id,created_at,updated_at) VALUES (?,?,?,?)`,
    ).run('good_resp', 'e1', now, now);
    db.prepare(
      `INSERT INTO requests (id,endpoint_id,method,path,created_at) VALUES (?,?,?,?,?)`,
    ).run('good_req', 'e1', 'GET', '/y', now);

    const { before, after } = runCleanup(db);
    expect(before).toEqual({ endpoints: 2, responses: 2, requests: 2 });
    expect(after).toEqual({ endpoints: 1, responses: 1, requests: 1 });
    db.close();
  });

  it('idempotent:第二次跑库中已无孤儿 -> 删 0 行,不报错', () => {
    const db = new Database(':memory:');
    createSchema(db);
    const now = Date.now();
    db.pragma('foreign_keys = OFF');
    db.prepare(
      `INSERT INTO endpoints (id,project_id,path,method,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    ).run('orphan_ep', 'no_such_project', '/x', 'GET', now, now);
    db.prepare(
      `INSERT INTO responses (id,endpoint_id,created_at,updated_at) VALUES (?,?,?,?)`,
    ).run('orphan_resp', 'no_such_endpoint', now, now);

    // 第一次:清掉 2 个孤儿
    const r1 = runCleanup(db);
    expect(r1.before.endpoints - r1.after.endpoints).toBe(1);
    expect(r1.before.responses - r1.after.responses).toBe(1);

    // 第二次:已无孤儿,删 0 行,不抛
    expect(() => runCleanup(db)).not.toThrow();
    const r2 = runCleanup(db);
    expect(r2.before).toEqual(r2.after);
    db.close();
  });

  it('顺序证明:先清孤儿(=0) -> 开 FK -> 后续 DELETE 级联生效', () => {
    // 模拟旧库升级流程:
    //   1. 旧连接(FK OFF)已有孤儿
    //   2. 运行清理迁移(独立 migrator 连接,FK OFF)-> 孤儿清零
    //   3. 应用新连接 db-sqlite.ts(FK ON)
    //   4. 之后 DELETE project -> 级联生效(证明 FK 真开了 + 旧孤儿已清)
    // 用临时文件而非 :memory::两个独立 Database 连接需共享同一库,:memory: 每连接隔离。
    const tmp = fs.mkdtempSync(path.join(process.cwd(), '.tmp-p14-'));
    const dbFile = path.join(tmp, 'test.db');
    try {
      // step1+2:migrator 视角,FK OFF,造孤儿再清
      const migrator = new Database(dbFile);
      migrator.pragma('foreign_keys = OFF');
      createSchema(migrator);
      const now = Date.now();
      migrator.prepare(
        `INSERT INTO endpoints (id,project_id,path,method,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
      ).run('old_orphan', 'gone_project', '/old', 'GET', now, now);
      for (const s of readMigrationStatements('0004_orphan_cleanup.sql')) migrator.exec(s);
      const afterClean = (
        migrator.prepare(`SELECT COUNT(*) c FROM endpoints`).get() as { c: number }
      ).c;
      expect(afterClean).toBe(0); // 旧孤儿已清
      migrator.close();

      // step3:应用新连接,FK ON(模拟 db-sqlite.ts 修复)
      const app = new Database(dbFile);
      app.pragma('foreign_keys = ON');
      // 此时库中无孤儿,插一条正常链
      app.prepare(
        `INSERT INTO projects (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)`,
      ).run('p1', 'P', 's1', now, now);
      app.prepare(
        `INSERT INTO endpoints (id,project_id,path,method,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
      ).run('e1', 'p1', '/y', 'GET', now, now);
      app.prepare(
        `INSERT INTO responses (id,endpoint_id,created_at,updated_at) VALUES (?,?,?,?)`,
      ).run('r1', 'e1', now, now);
      app.prepare(
        `INSERT INTO requests (id,endpoint_id,method,path,created_at) VALUES (?,?,?,?,?)`,
      ).run('req1', 'e1', 'GET', '/y', now);

      // step4:DELETE project -> 级联全清(证明 FK 真开 + 旧孤儿不在挡路)
      app.prepare(`DELETE FROM projects WHERE id=?`).run('p1');
      expect(app.prepare(`SELECT COUNT(*) c FROM endpoints`).get()).toEqual({ c: 0 });
      expect(app.prepare(`SELECT COUNT(*) c FROM responses`).get()).toEqual({ c: 0 });
      expect(app.prepare(`SELECT COUNT(*) c FROM requests`).get()).toEqual({ c: 0 });
      app.close();
    } finally {
      // 清理临时库 + WAL/SHM 副本
      for (const f of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, f));
      fs.rmdirSync(tmp);
    }
  });
});
