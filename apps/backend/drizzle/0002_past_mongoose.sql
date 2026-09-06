ALTER TABLE `jobs` ADD `fit_score` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fit_verdict` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fit_summary` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fit_strengths` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fit_concerns` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fit_model` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fit_analyzed_at` text;--> statement-breakpoint
CREATE TRIGGER `clear_job_fits_after_preferences_update`
AFTER UPDATE ON `job_preferences`
BEGIN
	UPDATE `jobs`
	SET `fit_score` = NULL,
		`fit_verdict` = NULL,
		`fit_summary` = NULL,
		`fit_strengths` = NULL,
		`fit_concerns` = NULL,
		`fit_model` = NULL,
		`fit_analyzed_at` = NULL;
END;
