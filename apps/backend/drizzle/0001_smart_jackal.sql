CREATE TABLE "company_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"kind" text NOT NULL,
	"contact_id" text,
	"job_id" text,
	"note" text DEFAULT '' NOT NULL,
	"deferred_until" text,
	"request_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "company_actions_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "company_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"identity" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"checked_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_discovery_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"rule" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"next_run_at" text,
	"last_run_at" text,
	"latest_run_id" text,
	"latest_counts" jsonb,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_search_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"search_id" text NOT NULL,
	"company_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"first_discovered_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"revision" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"identity" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"batch" text,
	"amount" text,
	"currency" text,
	"stage" text,
	"announcement_date" text,
	"publication_date" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_discovered_at" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "normalized_website" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "review_state" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "deferred_until" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_path" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_source_url" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_fetched_at" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_kind" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "enriched_at" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contacts_checked_at" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "enrichment_error" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "enrichment_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "company_actions" ADD CONSTRAINT "company_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_actions" ADD CONSTRAINT "company_actions_contact_id_company_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."company_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_actions" ADD CONSTRAINT "company_actions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_search_matches" ADD CONSTRAINT "company_search_matches_search_id_company_discovery_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."company_discovery_searches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_search_matches" ADD CONSTRAINT "company_search_matches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_search_matches" ADD CONSTRAINT "company_search_matches_signal_id_company_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."company_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_signals" ADD CONSTRAINT "company_signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_contact_identity" ON "company_contacts" USING btree ("company_id","identity");--> statement-breakpoint
CREATE INDEX "company_search_due" ON "company_discovery_searches" USING btree ("paused","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_search_signal" ON "company_search_matches" USING btree ("search_id","signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_signal_identity" ON "company_signals" USING btree ("company_id","identity");--> statement-breakpoint
CREATE INDEX "company_signal_provider" ON "company_signals" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "companies_website_identity" ON "companies" USING btree ("normalized_website");