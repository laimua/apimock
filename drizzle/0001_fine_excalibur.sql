CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`query` text,
	`headers` text,
	`body` text,
	`response_status` integer,
	`response_time` integer,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`endpoint_id`) REFERENCES `endpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`name` text,
	`description` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`delay_ms` integer DEFAULT 0,
	`tags` text DEFAULT '[]',
	`status_code` integer DEFAULT 200,
	`content_type` text DEFAULT 'application/json',
	`response_body` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_endpoints`("id", "project_id", "path", "method", "name", "description", "is_active", "delay_ms", "tags", "status_code", "content_type", "response_body", "created_at", "updated_at") SELECT "id", "project_id", "path", "method", "name", "description", "is_active", "delay_ms", "tags", "status_code", "content_type", "response_body", "created_at", "updated_at" FROM `endpoints`;--> statement-breakpoint
DROP TABLE `endpoints`;--> statement-breakpoint
ALTER TABLE `__new_endpoints` RENAME TO `endpoints`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `endpoints_project_method_path_idx` ON `endpoints` (`project_id`,`method`,`path`);--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`base_path` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`settings` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "name", "slug", "description", "base_path", "is_active", "settings", "created_at", "updated_at") SELECT "id", "name", "slug", "description", "base_path", "is_active", "settings", "created_at", "updated_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_idx` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text NOT NULL,
	`name` text,
	`description` text,
	`status_code` integer DEFAULT 200 NOT NULL,
	`headers` text DEFAULT '{}',
	`body` text,
	`body_template` text,
	`content_type` text DEFAULT 'application/json',
	`match_rules` text DEFAULT '{}',
	`is_default` integer DEFAULT 0,
	`priority` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`endpoint_id`) REFERENCES `endpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_responses`("id", "endpoint_id", "name", "description", "status_code", "headers", "body", "body_template", "content_type", "match_rules", "is_default", "priority", "created_at", "updated_at") SELECT "id", "endpoint_id", "name", "description", "status_code", "headers", "body", "body_template", "content_type", "match_rules", "is_default", "priority", "created_at", "updated_at" FROM `responses`;--> statement-breakpoint
DROP TABLE `responses`;--> statement-breakpoint
ALTER TABLE `__new_responses` RENAME TO `responses`;