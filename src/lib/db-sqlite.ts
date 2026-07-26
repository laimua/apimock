/**
 * SQLite 数据库连接
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema-sqlite';
import * as fs from 'fs';
import * as path from 'path';

const dbPath = process.env.SQLITE_PATH || './data/apimock.db';

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 仅在显式 DB_LOG_SQL=true 时开启 SQL 日志（默认关闭——mock 路由每个请求
// 跑多条 SQL，dev 下噪音很大）
export const sqliteDb = new Database(dbPath);
// WAL：读写不互斥，单实例并发 + .backup 一致性都依赖它。必须先于任何备份。
sqliteDb.pragma('journal_mode = WAL');
sqliteDb.pragma('wal_autocheckpoint = 1000'); // 每 1000 页 checkpoint，防 WAL 文件膨胀
// P1-4: 外键按连接生效（SQLite 默认 OFF）。drizzle/0000/0001 的 ON DELETE cascade
// 依赖此设置；缺失会导致删 project/endpoint 后 endpoints/responses/requests 成孤儿
// （MySQL 栈默认开 FK，故双栈行为不一致）。必须在连接创建处立即设，
// 不能在某次查询前临时设 —— better-sqlite3 每个 new Database 都是独立连接。
sqliteDb.pragma('foreign_keys = ON');

export const db = drizzle(sqliteDb, { schema, logger: process.env.DB_LOG_SQL === 'true' });

export function getDb() {
  return db;
}
