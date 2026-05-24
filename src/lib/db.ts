/**
 * 数据库配置 - 根据 DB_TYPE 选择驱动
 */

import { db as sqliteDb, getDb as sqliteGetDb } from './db-sqlite';

let _db: typeof sqliteDb;
let _getDb: typeof sqliteGetDb;

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

if (dbType === 'mysql') {
  // Dynamic import must be async but module-level await is valid in ESM
  // Using require as synchronous fallback for CommonJS compatibility
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./db-mysql');
  _db = mod.db;
  _getDb = mod.getDb;
} else {
  _db = sqliteDb;
  _getDb = sqliteGetDb;
}

export const db = _db;
export function getDb() { return _getDb(); }
