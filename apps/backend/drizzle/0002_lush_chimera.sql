CREATE TABLE `research_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`type` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_events_run` ON `research_events` (`run_id`,`id`);--> statement-breakpoint
CREATE TABLE `research_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`run_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`web_search` integer NOT NULL,
	`source_ids` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `research_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`run_id` text NOT NULL,
	`markdown` text NOT NULL,
	`source_ids` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_reports_company` ON `research_reports` (`company_id`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`draft` text DEFAULT '' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_active_company` ON `research_runs` (`company_id`) WHERE "research_runs"."state" = 'running';--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`run_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`links` text NOT NULL,
	`status` text NOT NULL,
	`retrieved_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_sources_company` ON `research_sources` (`company_id`);--> statement-breakpoint
DROP TABLE `ai_usage`;--> statement-breakpoint
ALTER TABLE `analysis_settings` DROP COLUMN `daily_limit`;--> statement-breakpoint
ALTER TABLE `analysis_settings` DROP COLUMN `timezone`;--> statement-breakpoint
ALTER TABLE `analysis_settings` DROP COLUMN `used`;--> statement-breakpoint
ALTER TABLE `analysis_settings` DROP COLUMN `next_reset_at`;