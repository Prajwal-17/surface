CREATE TABLE `job_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`target_roles` text NOT NULL,
	`preferred_skills` text DEFAULT '' NOT NULL,
	`location_preferences` text DEFAULT '' NOT NULL,
	`deal_breakers` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
