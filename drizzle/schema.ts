import { sqliteTable, AnySQLiteColumn, uniqueIndex, foreignKey, text, integer } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const endpoints = sqliteTable("endpoints", {
	id: text().primaryKey().notNull(),
	projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	path: text().notNull(),
	method: text().default("GET").notNull(),
	name: text(),
	description: text(),
	isActive: integer("is_active").default(1).notNull(),
	delayMs: integer("delay_ms").default(0),
	tags: text().default("[]"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
},
(table) => [
	uniqueIndex("endpoints_project_method_path_idx").on(table.projectId, table.method, table.path),
]);

export const projects = sqliteTable("projects", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	basePath: text("base_path"),
	isActive: integer("is_active").default(1).notNull(),
	settings: text().default("{}"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
},
(table) => [
	uniqueIndex("projects_slug_idx").on(table.slug),
	uniqueIndex("projects_slug_unique").on(table.slug),
]);

export const responses = sqliteTable("responses", {
	id: text().primaryKey().notNull(),
	endpointId: text("endpoint_id").notNull().references(() => endpoints.id, { onDelete: "cascade" } ),
	name: text(),
	description: text(),
	statusCode: integer("status_code").default(200).notNull(),
	headers: text().default("{}"),
	body: text(),
	bodyTemplate: text("body_template"),
	contentType: text("content_type").default("application/json"),
	matchRules: text("match_rules").default("{}"),
	isDefault: integer("is_default").default(0),
	priority: integer().default(0),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

