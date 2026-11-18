import { sql } from "drizzle-orm";
import { HttpError } from "../../shared/errors/http-error";
import { transaction, queryRows } from "../../infrastructure/database/client";

/** Permanently remove companies and company-owned records in one transaction. */
export async function deleteCompanies(ids: string[]) {
  return transaction(async (tx) => {
    const selected = JSON.stringify([...new Set(ids)]);
    const companyIds = sql`SELECT value FROM json_each(${selected})`;
    const jobIds = sql`SELECT id FROM jobs WHERE company_id IN (${companyIds})`;
    const sourceIds = sql`SELECT id FROM configured_sources WHERE company_id IN (${companyIds})`;
    const workIds = sql`SELECT id FROM work_items WHERE job_id IN (${jobIds}) OR source_id IN (${sourceIds}) OR (json_valid(payload) AND json_extract(payload, '$.companyId') IN (${companyIds}))`;
    const active = await queryRows<{ count: number }>(
      sql`SELECT count(*) AS count FROM work_items WHERE id IN (${workIds}) AND state IN ('queued', 'running')`,
    );
    if (active[0]?.count)
      throw new HttpError(409, "Wait for company work to finish before deleting these companies.");
    const existing = await queryRows<{ count: number }>(
      sql`SELECT count(*) AS count FROM companies WHERE id IN (${companyIds})`,
    );
    await tx.run(sql`DELETE FROM run_items WHERE work_id IN (${workIds})`);
    await tx.run(sql`DELETE FROM work_items WHERE id IN (${workIds})`);
    await tx.run(sql`DELETE FROM outreach_drafts WHERE
      (target = 'company' AND target_id IN (${companyIds})) OR
      (target = 'job' AND target_id IN (${jobIds})) OR
      (target = 'application' AND target_id IN (SELECT id FROM applications WHERE company_id IN (${companyIds}) OR job_id IN (${jobIds})))`);
    await tx.run(
      sql`DELETE FROM applications WHERE company_id IN (${companyIds}) OR job_id IN (${jobIds})`,
    );
    await tx.run(
      sql`DELETE FROM company_actions WHERE company_id IN (${companyIds}) OR job_id IN (${jobIds}) OR contact_id IN (SELECT id FROM company_contacts WHERE company_id IN (${companyIds}))`,
    );
    await tx.run(
      sql`DELETE FROM company_search_matches WHERE company_id IN (${companyIds}) OR signal_id IN (SELECT id FROM company_signals WHERE company_id IN (${companyIds}))`,
    );
    for (const table of [
      "company_contacts",
      "company_signals",
      "company_links",
    ])
      await tx.run(
        sql`DELETE FROM ${sql.identifier(table)} WHERE company_id IN (${companyIds})`,
      );
    const legacy = await tx.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='research_runs'`,
    );
    if (legacy.length) {
      for (const table of [
        "company_link_reviews",
        "research_events",
        "research_messages",
        "research_reports",
        "research_sources",
      ]) {
        const exists = await tx.all<{ name: string }>(
          sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
        );
        if (exists.length)
          await tx.run(
            sql`DELETE FROM ${sql.identifier(table)} WHERE run_id IN (SELECT id FROM research_runs WHERE company_id IN (${companyIds}))`,
          );
      }
      for (const table of [
        "company_link_reviews",
        "research_messages",
        "research_reports",
        "research_sources",
      ]) {
        const exists = await tx.all<{ name: string }>(
          sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
        );
        if (exists.length)
          await tx.run(
            sql`DELETE FROM ${sql.identifier(table)} WHERE company_id IN (${companyIds})`,
          );
      }
      await tx.run(
        sql`DELETE FROM research_runs WHERE company_id IN (${companyIds})`,
      );
    }
    await tx.run(
      sql`DELETE FROM assessments WHERE job_id IN (${jobIds}) OR job_version_id IN (SELECT id FROM job_versions WHERE job_id IN (${jobIds}))`,
    );
    await tx.run(
      sql`DELETE FROM duplicate_decisions WHERE left_id IN (${jobIds}) OR right_id IN (${jobIds})`,
    );
    await tx.run(
      sql`DELETE FROM job_versions WHERE job_id IN (${jobIds}) OR observation_id IN (SELECT id FROM observations WHERE job_id IN (${jobIds}) OR source_reference_id IN (SELECT id FROM job_sources WHERE job_id IN (${jobIds})))`,
    );
    await tx.run(
      sql`DELETE FROM observations WHERE job_id IN (${jobIds}) OR source_reference_id IN (SELECT id FROM job_sources WHERE job_id IN (${jobIds}))`,
    );
    await tx.run(sql`DELETE FROM job_sources WHERE job_id IN (${jobIds})`);
    await tx.run(
      sql`UPDATE jobs SET merged_into = NULL WHERE merged_into IN (${jobIds}) AND id NOT IN (${jobIds})`,
    );
    await tx.run(sql`DELETE FROM jobs WHERE company_id IN (${companyIds})`);
    await tx.run(
      sql`DELETE FROM configured_sources WHERE company_id IN (${companyIds})`,
    );
    await tx.run(sql`DELETE FROM companies WHERE id IN (${companyIds})`);
    return existing[0]?.count ?? 0;
  });
}
