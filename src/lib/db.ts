/**
 * 数据库配置
 * 使用 Drizzle ORM + SQLite
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@/lib/schema';
import * as fs from 'fs';
import * as path from 'path';

const dbPath = process.env.SQLITE_PATH || './data/apimock.db';

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = drizzle(new Database(dbPath), { schema, logger: true });

export function getDb() {
  return db;
}