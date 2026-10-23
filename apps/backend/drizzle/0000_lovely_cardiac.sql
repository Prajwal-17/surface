CREATE TABLE "discovery_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"location" text,
	"status" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "discovery_source_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"source" text NOT NULL,
	"configured_source_id" text,
	"availability" text DEFAULT 'unknown' NOT NULL,
	"missing_checks" integer DEFAULT 0 NOT NULL,
	"source_record_key" text NOT NULL,
	"external_id" text,
	"source_url" text NOT NULL,
	"first_seen_at" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text DEFAULT 'Location not listed' NOT NULL,
	"is_remote" boolean DEFAULT false NOT NULL,
	"employment_type" text,
	"description" text DEFAULT '' NOT NULL,
	"description_summary" jsonb,
	"apply_url" text NOT NULL,
	"posted_at" text,
	"status" text DEFAULT 'inbox' NOT NULL,
	"first_seen_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"reviewed_at" text,
	"analysis_requested" boolean DEFAULT false NOT NULL,
	"company_id" text,
	"description_html" text,
	"work_mode" text DEFAULT 'unknown' NOT NULL,
	"compensation" jsonb,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_version_id" text,
	"merged_into" text,
	"fit_score" integer,
	"fit_verdict" text,
	"fit_summary" text,
	"fit_strengths" jsonb,
	"fit_concerns" jsonb,
	"fit_model" text,
	"fit_analyzed_at" text
);
--> statement-breakpoint
CREATE TABLE "job_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"target_roles" text NOT NULL,
	"preferred_skills" text DEFAULT '' NOT NULL,
	"location_preferences" text DEFAULT '' NOT NULL,
	"deal_breakers" text DEFAULT '' NOT NULL,
	"context" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_revisions" (
	"revision" integer PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"watch_reason" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configured_sources" (
	"schedule_hours" integer DEFAULT 12 NOT NULL,
	"next_due_at" text,
	"last_success_at" text,
	"retry_at" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"endpoint" text NOT NULL,
	"provider" text NOT NULL,
	"board_identity" text,
	"support" text NOT NULL,
	"reason" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "configured_sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "duplicate_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"left_id" text NOT NULL,
	"right_id" text NOT NULL,
	"state" text NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" text NOT NULL,
	"observation_id" text
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"source_reference_id" text NOT NULL,
	"resource_id" text,
	"snapshot_id" text,
	"observed_at" text NOT NULL,
	"method" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"incomplete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "resources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"hash" text NOT NULL,
	"media_type" text NOT NULL,
	"status_code" integer NOT NULL,
	"byte_length" integer NOT NULL,
	"fetched_at" text NOT NULL,
	"removed_at" text
);
--> statement-breakpoint
CREATE TABLE "executor_lease" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_items" (
	"run_id" text NOT NULL,
	"work_id" text NOT NULL,
	CONSTRAINT "run_items_run_id_work_id_pk" PRIMARY KEY("run_id","work_id")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"state" text NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"source_ids" jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule_hours" integer DEFAULT 12 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"next_due_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source_id" text,
	"job_id" text,
	"identity" text NOT NULL,
	"state" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_at" text NOT NULL,
	"error" text,
	"result" jsonb,
	"created_at" text NOT NULL,
	"started_at" text,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "analysis_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"job_version_id" text NOT NULL,
	"profile_revision" integer NOT NULL,
	"format_version" integer NOT NULL,
	"output" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_link_reviews" (
	"company_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"links" jsonb NOT NULL,
	"checked_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"run_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"web_search" boolean NOT NULL,
	"source_ids" jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"run_id" text NOT NULL,
	"markdown" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"draft" text DEFAULT '' NOT NULL,
	"error" text,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"run_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"links" jsonb NOT NULL,
	"status" text NOT NULL,
	"retrieved_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovery_source_runs" ADD CONSTRAINT "discovery_source_runs_run_id_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configured_sources" ADD CONSTRAINT "configured_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_decisions" ADD CONSTRAINT "duplicate_decisions_left_id_jobs_id_fk" FOREIGN KEY ("left_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_decisions" ADD CONSTRAINT "duplicate_decisions_right_id_jobs_id_fk" FOREIGN KEY ("right_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_versions" ADD CONSTRAINT "job_versions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_versions" ADD CONSTRAINT "job_versions_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_reference_id_job_sources_id_fk" FOREIGN KEY ("source_reference_id") REFERENCES "public"."job_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_work_id_work_items_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_job_version_id_job_versions_id_fk" FOREIGN KEY ("job_version_id") REFERENCES "public"."job_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_link_reviews" ADD CONSTRAINT "company_link_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_link_reviews" ADD CONSTRAINT "company_link_reviews_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_events" ADD CONSTRAINT "research_events_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_messages" ADD CONSTRAINT "research_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_messages" ADD CONSTRAINT "research_messages_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_runs_started_at_idx" ON "discovery_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "discovery_source_runs_run_id_idx" ON "discovery_source_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "discovery_source_runs_source_idx" ON "discovery_source_runs" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "job_sources_record_key_unique" ON "job_sources" USING btree ("source_record_key");--> statement-breakpoint
CREATE INDEX "job_sources_job_id_idx" ON "job_sources" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_sources_source_idx" ON "job_sources" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key_unique" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_canonical_url_idx" ON "jobs" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_posted_at_idx" ON "jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "versions_job_idx" ON "job_versions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "observations_job_idx" ON "observations" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "work_queue_idx" ON "work_items" USING btree ("state","retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_active_identity" ON "work_items" USING btree ("identity") WHERE "work_items"."state" IN ('queued','running');--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_identity_unique" ON "assessments" USING btree ("job_id","job_version_id","profile_revision","format_version");--> statement-breakpoint
CREATE INDEX "research_events_run" ON "research_events" USING btree ("run_id","id");--> statement-breakpoint
CREATE INDEX "research_reports_company" ON "research_reports" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_active_company" ON "research_runs" USING btree ("company_id") WHERE "research_runs"."state" = 'running';--> statement-breakpoint
CREATE INDEX "research_sources_company" ON "research_sources" USING btree ("company_id");