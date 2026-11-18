import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SQLITE_DATABASE_FILE = ":memory:";
process.env.NODE_ENV = "test";
const { runMigrations } = await import("../src/infrastructure/database/migrate.ts");
const { sqliteHandle } = await import("../src/infrastructure/database/client.ts");
const { deleteCompanies } = await import("../src/modules/company-discovery/delete-companies.ts");
await runMigrations();
const db = sqliteHandle();
test("deletes linked data atomically and retains other companies", async () => {
  db.exec(`INSERT INTO companies (id,name,created_at,updated_at) VALUES ('a','A','now','now'),('b','B','now','now');
    INSERT INTO research_runs (id,company_id,kind,state,created_at) VALUES ('r','a','research','done','now');
    INSERT INTO research_sources (id,company_id,run_id,url,title,kind,text,links,status,retrieved_at) VALUES ('s','a','r','url','title','page','','[]','ok','now');
    INSERT INTO jobs (id,dedupe_key,canonical_url,title,company,apply_url,first_seen_at,last_seen_at,created_at,updated_at,company_id) VALUES ('j','j','url','Job','A','url','now','now','now','now','a');
    INSERT INTO applications (id,job_id,company_id,title,company_name,created_at,updated_at) VALUES ('app','j','a','Job','A','now','now');
    INSERT INTO outreach_drafts (id,target,target_id,updated_at) VALUES ('d1','company','a','now'),('d2','job','j','now'),('d3','application','app','now'),('d4','company','b','now');`);
  assert.equal(await deleteCompanies(["a"]), 1);
  for (const table of ["research_runs", "research_sources", "jobs", "applications"]) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM companies WHERE id='b'").get()?.n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM outreach_drafts WHERE id='d4'").get()?.n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM outreach_drafts").get()?.n, 1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
test("active work prevents deletion", async () => {
  db.exec(`INSERT INTO work_items (id,kind,payload,identity,state,retry_at,created_at) VALUES ('w','company-enrichment','{"companyId":"b"}','w','queued','now','now');`);
  await assert.rejects(deleteCompanies(["b"]), /Wait for company work/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM companies WHERE id='b'").get()?.n, 1);
});
