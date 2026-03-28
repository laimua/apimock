/**
 * 数据库迁移脚本
 * 使用 Drizzle ORM
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============================================
// 数据库连接
// ============================================
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

// ============================================
// Schema 定义（与 schema.ts 保持一致）
// ============================================
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  basePath: text('base_path'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  settings: text('settings', { mode: 'json' }).default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('projects_slug_idx').on(table.slug),
}));

export const endpoints = sqliteTable('endpoints', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  method: text('method', { enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] }).notNull().default('GET'),
  name: text('name'),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  delayMs: integer('delay_ms').default(0),
  tags: text('tags', { mode: 'json' }).default([]),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  endpointIdx: uniqueIndex('endpoints_lookup_idx').on(table.projectId, table.method, table.path),
}));

export const responses = sqliteTable('responses', {
  id: text('id').primaryKey(),
  endpointId: text('endpoint_id').notNull().references(() => endpoints.id, { onDelete: 'cascade' }),
  name: text('name'),
  description: text('description'),
  statusCode: integer('status_code').notNull().default(200),
  headers: text('headers', { mode: 'json' }).default({}),
  body: text('body', { mode: 'json' }),
  bodyTemplate: text('body_template'),
  contentType: text('content_type').default('application/json'),
  matchRules: text('match_rules', { mode: 'json' }).default({}),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  priority: integer('priority').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// 迁移函数
// ============================================
async function migrate() {
  console.log('🔄 Starting database migration...');

  try {
    // 创建表（如果不存在）
    await client.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        base_path TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        settings TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    console.log('✅ projects table created');

    await client.execute(`
      CREATE TABLE IF NOT EXISTS endpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'GET',
        name TEXT,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        delay_ms INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, method, path)
      )
    `);
    console.log('✅ endpoints table created');

    await client.execute(`
      CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        endpoint_id TEXT NOT NULL,
        name TEXT,
        description TEXT,
        status_code INTEGER NOT NULL DEFAULT 200,
        headers TEXT DEFAULT '{}',
        body TEXT,
        body_template TEXT,
        content_type TEXT DEFAULT 'application/json',
        match_rules TEXT DEFAULT '{}',
        is_default INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ responses table created');

    // 创建索引
    await client.execute(`
      CREATE INDEX IF NOT EXISTS endpoints_lookup_idx ON endpoints(project_id, method, path)
    `);
    console.log('✅ indexes created');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// 运行迁移
migrate();
