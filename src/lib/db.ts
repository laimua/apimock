/**
 * 数据库配置
 * 使用 Drizzle ORM + libSQL (libsql driver)
 * 支持 SQLite, Turso, libsql
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

import * as schema from '@/lib/schema';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema, logger: true });

export function getDb() {
  return db;
}

