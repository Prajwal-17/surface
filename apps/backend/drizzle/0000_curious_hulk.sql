CREATE TABLE `discovery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`location` text,
	`status` text NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`inserted_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `discovery_runs_started_at_idx` ON `discovery_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `discovery_source_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`fetched_count` integer DEFAULT 0 NOT NULL,
	`accepted_count` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discovery_source_runs_run_id_idx` ON `discovery_source_runs` (`run_id`);--> statement-breakpoint
CREATE INDEX `discovery_source_runs_source_idx` ON `discovery_source_runs` (`source`);--> statement-breakpoint
CREATE TABLE `job_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`source` text NOT NULL,
	`source_record_key` text NOT NULL,
	`external_id` text,
	`source_url` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_sources_record_key_unique` ON `job_sources` (`source_record_key`);--> statement-breakpoint
CREATE INDEX `job_sources_job_id_idx` ON `job_sources` (`job_id`);--> statement-breakpoint
CREATE INDEX `job_sources_source_idx` ON `job_sources` (`source`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text DEFAULT 'Location not listed' NOT NULL,
	`is_remote` integer DEFAULT false NOT NULL,
	`employment_type` text,
	`description` text DEFAULT '' NOT NULL,
	`apply_url` text NOT NULL,
	`posted_at` text,
	`status` text DEFAULT 'inbox' NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_canonical_url_idx` ON `jobs` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_posted_at_idx` ON `jobs` (`posted_at`);