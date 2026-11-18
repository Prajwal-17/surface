CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"company_id" text,
	"title" text NOT NULL,
	"company_name" text NOT NULL,
	"source_url" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"outcome" text,
	"contact_name" text,
	"contact_email" text,
	"applied_on" text,
	"contacted_on" text,
	"follow_up_on" text,
	"archived_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "applications_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "applications_status_check" CHECK ("applications"."status" in ('queued', 'applied', 'contacted', 'in_conversation', 'closed', 'ignored'))
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_company_idx" ON "applications" USING btree ("company_id");

--> statement-breakpoint
-- Resolve saved and dismissed aliases to the surviving job. UNION also
-- terminates on invalid cycles. The original job decisions stay in jobs.
WITH RECURSIVE job_links (decision_id, job_id) AS (
  SELECT id, id
  FROM jobs
  WHERE status IN ('saved', 'dismissed')
  UNION
  SELECT job_links.decision_id, jobs.merged_into
  FROM job_links
  JOIN jobs ON jobs.id = job_links.job_id
  WHERE jobs.merged_into IS NOT NULL
), ranked_decisions AS (
  SELECT
    target.id AS job_id,
    companies.id AS company_id,
    target.title,
    target.company AS company_name,
    target.apply_url AS source_url,
    CASE decision.status WHEN 'saved' THEN 'queued' ELSE 'ignored' END AS status,
    decision.created_at,
    decision.updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY target.id
      ORDER BY
        CASE WHEN decision.id = target.id THEN 0 ELSE 1 END,
        decision.updated_at DESC,
        decision.id
    ) AS priority
  FROM job_links
  JOIN jobs AS target ON target.id = job_links.job_id
  JOIN jobs AS decision ON decision.id = job_links.decision_id
  LEFT JOIN companies ON companies.id = target.company_id
  WHERE target.merged_into IS NULL
)
INSERT INTO applications (
  id, job_id, company_id, title, company_name, source_url, status, created_at, updated_at
)
SELECT
  'legacy-job:' || job_id, job_id, company_id, title, company_name, source_url,
  status, created_at, updated_at
FROM ranked_decisions
WHERE priority = 1
ON CONFLICT (job_id) DO NOTHING;
