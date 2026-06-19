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

export const db = drizzle(new Database(dbPath), { schema, logger: process.env.NODE_ENV !== 'production' });

export function getDb() {
  return db;
}
