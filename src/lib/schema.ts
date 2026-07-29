/**
 * Schema 统一入口 —— 应用层统一用 SQLite schema 的类型
 *
 * 注意:这里**不是**按 DB_TYPE 选择方言,而是无条件 re-export schema-sqlite。
 * 设计如下:
 *   - 应用层(路由/service)统一 import 本文件,用 SQLite schema 推断的类型
 *     (schema-sqlite 与 schema-mysql 的表/字段定义需手动保持一致)。
 *   - MySQL 驱动(`db-mysql.ts`)单独 import schema-mysql,SQLite 驱动
 *     (`db-sqlite.ts`)单独 import schema-sqlite。
 *   - 两者靠 drizzle 运行时按表名解析查询,字段名/类型需手动对齐两份 schema。
 */
export * from "./schema-sqlite";
