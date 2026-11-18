CREATE TABLE `company_links` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`category` text NOT NULL,
	`url` text NOT NULL,
	`label` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_link_url` ON `company_links` (`company_id`,`url`);--> statement-breakpoint
CREATE INDEX `company_links_company` ON `company_links` (`company_id`);