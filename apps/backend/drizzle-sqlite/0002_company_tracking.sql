ALTER TABLE `companies` ADD `tracking_status` text DEFAULT 'watching' NOT NULL;
--> statement-breakpoint
UPDATE companies
SET tracking_status = CASE review_state WHEN 'will_apply' THEN 'queued' WHEN 'skipped' THEN 'ignored' END
WHERE review_state IN ('will_apply', 'skipped');
