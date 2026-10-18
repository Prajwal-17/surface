CREATE TABLE `company_link_reviews` (
	`company_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`links` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action
);
