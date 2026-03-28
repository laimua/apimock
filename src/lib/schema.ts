/**
 * 数据库 Schema 定义
 * 使用 Drizzle ORM
 */

import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============================================
// 项目表
// ============================================
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  basePath: text('base_path'),
  isActive: integer('is_active').notNull().default(1),
  settings: text('settings').default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('projects_slug_idx').on(table.slug),
}));

// ============================================
// 端点表
// ============================================
export const endpoints = sqliteTable('endpoints', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  method: text('method', { enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] }).notNull().default('GET'),
  name: text('name'),
  description: text('description'),
  isActive: integer('is_active').notNull().default(1),
  delayMs: integer('delay_ms').default(0),
  tags: text('tags').default('[]'),
  // 响应配置字段
  statusCode: integer('status_code').default(200),
  contentType: text('content_type').default('application/json'),
  responseBody: text('response_body'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  // 复合唯一索引：同一项目下相同 method+path 只能有一个
  endpointUnique: uniqueIndex('endpoints_project_method_path_idx').on(table.projectId, table.method, table.path),
}));

// ============================================
// 请求记录表
// ============================================
export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  endpointId: text('endpoint_id').notNull().references(() => endpoints.id, { onDelete: 'cascade' }),
  method: text('method').notNull(),
  path: text('path').notNull(),
  query: text('query'), // JSON 字符串
  headers: text('headers'), // JSON 字符串
  body: text('body'),
  responseStatus: integer('response_status'),
  responseTime: integer('response_time'), // 响应时间 ms
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
});

// ============================================
// 响应表
// ============================================
export const responses = sqliteTable('responses', {
  id: text('id').primaryKey(),
  endpointId: text('endpoint_id').notNull().references(() => endpoints.id, { onDelete: 'cascade' }),
  name: text('name'),
  description: text('description'),
  statusCode: integer('status_code').notNull().default(200),
  headers: text('headers').default('{}'),
  body: text('body'),
  bodyTemplate: text('body_template'),
  contentType: text('content_type').default('application/json'),
  matchRules: text('match_rules').default('{}'),
  isDefault: integer('is_default').default(0),
  priority: integer('priority').default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

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
export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider', { enum: ['openai', 'anthropic', 'openai-compatible'] }).notNull(),
  baseUrl: text('base_url'),
  apiKey: text('api_key').notNull(),
  models: text('models').notNull(), // JSON string
  defaultModel: text('default_model'),
  systemPrompt: text('system_prompt'),
  isActive: integer('is_active').notNull().default(1),
  isDefault: integer('is_default').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
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
