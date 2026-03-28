-- Create requests table
CREATE TABLE IF NOT EXISTS `requests` (
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
