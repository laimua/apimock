/**
 * MySQL Schema 定义
 */

import { mysqlTable, varchar, text, longtext, bigint, tinyint, uniqueIndex, index } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

// ============================================
// 项目表
// ============================================
export const projects = mysqlTable('projects', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  basePath: varchar('base_path', { length: 500 }),
  isActive: tinyint('is_active').notNull().default(1),
  settings: text('settings').default('{}'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('projects_slug_idx').on(table.slug),
}));

// ============================================
// 端点表
// ============================================
export const endpoints = mysqlTable('endpoints', {
  id: varchar('id', { length: 36 }).primaryKey(),
  projectId: varchar('project_id', { length: 36 }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: varchar('path', { length: 500 }).notNull(),
  method: varchar('method', { length: 10, enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] }).notNull().default('GET'),
  name: varchar('name', { length: 255 }),
  description: text('description'),
  isActive: tinyint('is_active').notNull().default(1),
  delayMs: bigint('delay_ms', { mode: 'number' }).default(0),
  tags: text('tags').default('[]'),
  statusCode: bigint('status_code', { mode: 'number' }).default(200),
  contentType: varchar('content_type', { length: 100 }).default('application/json'),
  responseBody: longtext('response_body'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, (table) => ({
  endpointUnique: uniqueIndex('endpoints_project_method_path_idx').on(table.projectId, table.method, table.path),
}));

// ============================================
// 请求记录表
// ============================================
export const requests = mysqlTable('requests', {
  id: varchar('id', { length: 36 }).primaryKey(),
  endpointId: varchar('endpoint_id', { length: 36 }).references(() => endpoints.id, { onDelete: 'cascade' }),
  method: varchar('method', { length: 10 }).notNull(),
  path: varchar('path', { length: 500 }).notNull(),
  query: text('query'),
  headers: text('headers'),
  body: longtext('body'),
  responseStatus: bigint('response_status', { mode: 'number' }),
  responseTime: bigint('response_time', { mode: 'number' }),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (table) => ({
  endpointIdx: index('requests_endpoint_idx').on(table.endpointId),
  createdIdx: index('requests_created_idx').on(table.createdAt),
}));

// ============================================
// 响应表
// ============================================
export const responses = mysqlTable('responses', {
  id: varchar('id', { length: 36 }).primaryKey(),
  endpointId: varchar('endpoint_id', { length: 36 }).notNull().references(() => endpoints.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }),
  description: text('description'),
  statusCode: bigint('status_code', { mode: 'number' }).notNull().default(200),
  headers: text('headers').default('{}'),
  body: longtext('body'),
  // body_template 字段在代码中从未使用，schema 层已移除；DB 已存在的列保留无害
  contentType: varchar('content_type', { length: 100 }).default('application/json'),
  matchRules: text('match_rules').default('{}'),
  isDefault: tinyint('is_default').default(0),
  priority: bigint('priority', { mode: 'number' }).default(0),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, (table) => ({
  endpointIdx: index('responses_endpoint_idx').on(table.endpointId),
}));

// ============================================
// 关系定义
// ============================================
export const projectsRelations = relations(projects, ({ many }) => ({
  endpoints: many(endpoints),
}));

export const endpointsRelations = relations(endpoints, ({ one, many }) => ({
  project: one(projects, {
    fields: [endpoints.projectId],
    references: [projects.id],
  }),
  responses: many(responses),
  requestRecords: many(requests),
}));

export const responsesRelations = relations(responses, ({ one }) => ({
  endpoint: one(endpoints, {
    fields: [responses.endpointId],
    references: [endpoints.id],
  }),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  endpoint: one(endpoints, {
    fields: [requests.endpointId],
    references: [endpoints.id],
  }),
}));

// ============================================
// AI Providers 表
// ============================================
export const aiProviders = mysqlTable('ai_providers', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 30, enum: ['openai', 'anthropic', 'openai-compatible'] }).notNull(),
  baseUrl: varchar('base_url', { length: 500 }),
  apiKey: text('api_key').notNull(),
  models: text('models').notNull(),
  defaultModel: varchar('default_model', { length: 100 }),
  systemPrompt: longtext('system_prompt'),
  isActive: tinyint('is_active').notNull().default(1),
  isDefault: tinyint('is_default').notNull().default(0),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// ============================================
// 类型导出
// ============================================
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;
export type Response = typeof responses.$inferSelect;
export type NewResponse = typeof responses.$inferInsert;
export type RequestRecord = typeof requests.$inferSelect;
export type NewRequestRecord = typeof requests.$inferInsert;
export type AiProvider = typeof aiProviders.$inferSelect;
export type NewAiProvider = typeof aiProviders.$inferInsert;
