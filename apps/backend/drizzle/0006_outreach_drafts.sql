CREATE TABLE "outreach_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"target" text NOT NULL,
	"target_id" text NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"writing_examples" text DEFAULT '' NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_target_unique" ON "outreach_drafts" USING btree ("target","target_id");