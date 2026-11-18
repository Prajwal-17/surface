CREATE TABLE `job_search_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`employment_type` text DEFAULT 'any' NOT NULL,
	`remote_only` integer DEFAULT false NOT NULL,
	`interval_minutes` integer DEFAULT 0 NOT NULL,
	`max_applications` integer DEFAULT 10 NOT NULL,
	`max_companies` integer DEFAULT 5 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`running_run_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_search_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`found` integer DEFAULT 0 NOT NULL,
	`inserted_applications` integer DEFAULT 0 NOT NULL,
	`inserted_companies` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`sources` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_search_seen` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_url` text NOT NULL,
	`source` text NOT NULL,
	`application_id` text,
	`first_seen_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `job_search_runs_started_idx` ON `job_search_runs` (`started_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_search_seen_canonical_url_unique` ON `job_search_seen` (`canonical_url`);
--> statement-breakpoint
CREATE INDEX `job_search_seen_application_idx` ON `job_search_seen` (`application_id`);
--> statement-breakpoint
ALTER TABLE `applications` ADD `description` text;
--> statement-breakpoint
ALTER TABLE `applications` ADD `published_at` text;
