CREATE TABLE `analysis_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`paused` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`job_version_id` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`format_version` integer NOT NULL,
	`output` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_version_id`) REFERENCES `job_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_identity_unique` ON `assessments` (`job_id`,`job_version_id`,`profile_revision`,`format_version`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`watch_reason` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`normalized_website` text,
	`review_state` text DEFAULT 'new' NOT NULL,
	`deferred_until` text,
	`logo_path` text,
	`logo_source_url` text,
	`logo_fetched_at` text,
	`logo_kind` text,
	`enriched_at` text,
	`details_checked_at` text,
	`contacts_checked_at` text,
	`enrichment_error` text,
	`enrichment_evidence` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `companies_website_identity` ON `companies` (`normalized_website`);--> statement-breakpoint
CREATE TABLE `company_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`contact_id` text,
	`job_id` text,
	`note` text DEFAULT '' NOT NULL,
	`deferred_until` text,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `company_contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_actions_request_id_unique` ON `company_actions` (`request_id`);--> statement-breakpoint
CREATE TABLE `company_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`identity` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`methods` text DEFAULT '[]' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`manual` integer DEFAULT false NOT NULL,
	`checked_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_contact_identity` ON `company_contacts` (`company_id`,`identity`);--> statement-breakpoint
CREATE TABLE `company_discovery_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`rule` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`next_run_at` text,
	`last_run_at` text,
	`latest_run_id` text,
	`latest_counts` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `company_search_due` ON `company_discovery_searches` (`paused`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `company_link_reviews` (
	`company_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`links` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `company_search_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`search_id` text NOT NULL,
	`company_id` text NOT NULL,
	`signal_id` text NOT NULL,
	`first_discovered_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`search_id`) REFERENCES `company_discovery_searches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signal_id`) REFERENCES `company_signals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_search_signal` ON `company_search_matches` (`search_id`,`signal_id`);--> statement-breakpoint
CREATE TABLE `company_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`identity` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text,
	`batch` text,
	`amount` text,
	`currency` text,
	`stage` text,
	`announcement_date` text,
	`publication_date` text,
	`evidence` text DEFAULT '[]' NOT NULL,
	`first_discovered_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_signal_identity` ON `company_signals` (`company_id`,`identity`);--> statement-breakpoint
CREATE INDEX `company_signal_provider` ON `company_signals` (`provider`,`provider_id`);--> statement-breakpoint
CREATE TABLE `configured_sources` (
	`schedule_hours` integer DEFAULT 12 NOT NULL,
	`next_due_at` text,
	`last_success_at` text,
	`retry_at` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`endpoint` text NOT NULL,
	`provider` text NOT NULL,
	`board_identity` text,
	`support` text NOT NULL,
	`reason` text NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `configured_sources_url_unique` ON `configured_sources` (`url`);--> statement-breakpoint
CREATE TABLE `coordination_locks` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `duplicate_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`left_id` text NOT NULL,
	`right_id` text NOT NULL,
	`state` text NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`left_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`right_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `executor_lease` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`target_roles` text NOT NULL,
	`preferred_skills` text DEFAULT '' NOT NULL,
	`location_preferences` text DEFAULT '' NOT NULL,
	`deal_breakers` text DEFAULT '' NOT NULL,
	`context` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`source` text NOT NULL,
	`configured_source_id` text,
	`availability` text DEFAULT 'unknown' NOT NULL,
	`missing_checks` integer DEFAULT 0 NOT NULL,
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
CREATE TABLE `job_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`observation_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `versions_job_idx` ON `job_versions` (`job_id`);--> statement-breakpoint
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
	`description_summary` text,
	`apply_url` text NOT NULL,
	`posted_at` text,
	`status` text DEFAULT 'inbox' NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`reviewed_at` text,
	`analysis_requested` integer DEFAULT false NOT NULL,
	`company_id` text,
	`description_html` text,
	`work_mode` text DEFAULT 'unknown' NOT NULL,
	`compensation` text,
	`countries` text DEFAULT '[]' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`current_version_id` text,
	`merged_into` text,
	`fit_score` integer,
	`fit_verdict` text,
	`fit_summary` text,
	`fit_strengths` text,
	`fit_concerns` text,
	`fit_model` text,
	`fit_analyzed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_canonical_url_idx` ON `jobs` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_posted_at_idx` ON `jobs` (`posted_at`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`source_reference_id` text NOT NULL,
	`resource_id` text,
	`snapshot_id` text,
	`observed_at` text NOT NULL,
	`method` text NOT NULL,
	`evidence` text NOT NULL,
	`incomplete` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_reference_id`) REFERENCES `job_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `observations_job_idx` ON `observations` (`job_id`);--> statement-breakpoint
CREATE TABLE `profile_revisions` (
	`revision` integer PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resources_url_unique` ON `resources` (`url`);--> statement-breakpoint
CREATE TABLE `run_items` (
	`run_id` text NOT NULL,
	`work_id` text NOT NULL,
	PRIMARY KEY(`run_id`, `work_id`),
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`source_ids` text NOT NULL,
	`filters` text DEFAULT '{}' NOT NULL,
	`schedule_hours` integer DEFAULT 12 NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`next_due_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`hash` text NOT NULL,
	`media_type` text NOT NULL,
	`status_code` integer NOT NULL,
	`byte_length` integer NOT NULL,
	`fetched_at` text NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source_id` text,
	`job_id` text,
	`payload` text,
	`identity` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retry_at` text NOT NULL,
	`error` text,
	`result` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `work_queue_idx` ON `work_items` (`state`,`retry_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `work_active_identity` ON `work_items` (`identity`) WHERE "work_items"."state" IN ('queued','running');