-- P1-4: 一次性清理历史孤儿行
-- 背景:SQLite 默认 PRAGMA foreign_keys=OFF（按连接生效），历史上删 project/endpoint
-- 后 endpoints/responses/requests 因 ON DELETE cascade 不触发而成为孤儿。MySQL 栈
-- 默认开 FK，无此问题。本迁移在开启 FK 之前一次性清掉存量孤儿，使新连接开 FK 后
-- 所有行引用关系干净;之后 DELETE 级联由新加的 PRAGMA foreign_keys=ON 兜底。
--
-- 幂等性:WHERE NOT IN (SELECT id FROM parent) 形式，第二次跑库中已无孤儿 -> 删 0 行，
-- 不报错、不二次删。
-- 顺序:无论 migrate 连接的 FK 状态如何，本迁移的 DELETE 都安全 —— 删的是引用方
-- （子表行），不触发任何级联副作用；FK 约束只在 INSERT/UPDATE 父子关系时检查，
-- 不阻止删孤儿。生产中 drizzle migrate 复用 db-sqlite.ts 单例（该连接已被 pragma
-- 设 FK=ON），孤儿在 migrate 阶段清掉，之后任何 DELETE 级联由 FK 正常兜底。
-- 双栈:DELETE FROM ... WHERE NOT IN (...) 在 MySQL 同样合法且幂等；但 MySQL 部署走
-- db:migrate:legacy（scripts/migrate.ts，独立 MySQL 分支，不读本文件），本迁移实际
-- 只在 SQLite 栈执行。
DELETE FROM `endpoints`
WHERE `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
DELETE FROM `responses`
WHERE `endpoint_id` NOT IN (SELECT `id` FROM `endpoints`);--> statement-breakpoint
DELETE FROM `requests`
WHERE `endpoint_id` NOT IN (SELECT `id` FROM `endpoints`);
