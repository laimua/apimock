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

export const db = drizzle(sqliteDb, { schema, logger: process.env.DB_LOG_SQL === 'true' });

export function getDb() {
  return db;
}
