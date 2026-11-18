ALTER TABLE `applications` ADD `location` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `employment_type` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `work_mode` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `compensation` text;--> statement-breakpoint
CREATE INDEX `companies_normalized_name_idx` ON `companies` (lower(trim("name")));--> statement-breakpoint
CREATE INDEX `jobs_company_idx` ON `jobs` (`company_id`);
--> statement-breakpoint
-- Preserve decisions written by older clients after migration 0001.
INSERT INTO applications (
  id, job_id, company_id, title, company_name, source_url, status, created_at, updated_at
)
SELECT 'legacy-job:' || j.id, j.id, c.id, j.title, j.company, j.apply_url,
       CASE j.status WHEN 'saved' THEN 'queued' ELSE 'ignored' END, j.created_at, j.updated_at
FROM jobs j
LEFT JOIN companies c ON c.id = j.company_id
WHERE j.merged_into IS NULL AND j.status IN ('saved', 'dismissed')
ON CONFLICT (job_id) DO NOTHING;
--> statement-breakpoint
-- Create company records for legacy names, while leaving ambiguous names alone.
WITH names AS (
  SELECT trim(company) AS name, created_at FROM jobs WHERE merged_into IS NULL
  UNION ALL
  SELECT trim(company_name), created_at FROM applications
), missing AS (
  SELECT min(name) AS name, min(created_at) AS created_at
  FROM names
  WHERE name <> ''
    AND NOT EXISTS (
      SELECT 1 FROM companies c WHERE lower(trim(c.name)) = lower(names.name)
    )
  GROUP BY lower(name)
)
INSERT INTO companies (id, name, created_at, updated_at)
SELECT lower(hex(randomblob(16))), name, created_at, created_at FROM missing;
--> statement-breakpoint
WITH named_companies AS (
  SELECT min(id) AS id, lower(trim(name)) AS key
  FROM companies GROUP BY lower(trim(name)) HAVING count(*) = 1
)
UPDATE jobs
SET company_id = named_companies.id
FROM named_companies
WHERE jobs.merged_into IS NULL
  AND lower(trim(jobs.company)) = named_companies.key
  AND (jobs.company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM companies WHERE companies.id = jobs.company_id
  ));
--> statement-breakpoint
UPDATE applications
SET company_id = jobs.company_id
FROM jobs
WHERE applications.job_id = jobs.id AND applications.company_id IS NULL
  AND lower(trim(applications.company_name)) = lower(trim(jobs.company))
  AND EXISTS (SELECT 1 FROM companies WHERE companies.id = jobs.company_id);
--> statement-breakpoint
WITH named_companies AS (
  SELECT min(id) AS id, lower(trim(name)) AS key
  FROM companies GROUP BY lower(trim(name)) HAVING count(*) = 1
)
UPDATE applications
SET company_id = named_companies.id
FROM named_companies
WHERE applications.company_id IS NULL
  AND lower(trim(applications.company_name)) = named_companies.key;
--> statement-breakpoint
UPDATE applications
SET location = jobs.location,
    employment_type = jobs.employment_type,
    work_mode = jobs.work_mode,
    compensation = jobs.compensation,
    source_url = coalesce(nullif(applications.source_url, ''), nullif(jobs.apply_url, ''), jobs.canonical_url)
FROM jobs WHERE applications.job_id = jobs.id;
