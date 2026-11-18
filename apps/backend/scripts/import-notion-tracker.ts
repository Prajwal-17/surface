import { DatabaseSync } from "node:sqlite";
import { env } from "../src/config/env";
import { desktopProfilePaths } from "../src/config/desktop-profile";

/**
 * Imports the Notion Companies and Applications databases into the tracker.
 *
 * Mapping:
 * - Company → tracker_companies.name, Website → website, Country / State →
 *   location, Research status → status, Notes → notes. People (company size)
 *   and Tags are appended to notes because the tracker has no field for them.
 * - Opportunity → tracker_applications.title, Company relation → company_id,
 *   Status → status, Type → type, Outcome → outcome, Link → source_url,
 *   Last contacted → contacted_on, Channels used → notes.
 *
 * Notion page ids become tracker ids, so re-running updates the same rows.
 */

const APPLICATION_STATUSES = [
  "To apply",
  "Applied",
  "In conversation",
  "Closed",
];
const COMPANY_STATUSES = ["Listed", "To research", "Outreach", "Archived"];
const STATUS_FALLBACK = { application: "To apply", company: "Listed" };

const DATABASES = {
  companies: "35c2d48b-d982-46cb-96f5-f1807145c301",
  applications: "3279c867-a37a-800b-aec6-ea78e595d890",
};

interface NotionProperty {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  url?: string | null;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  relation?: { id: string }[];
  date?: { start: string } | null;
}

interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, NotionProperty>;
}

const token = process.env.NOTION_TOKEN?.trim();
if (!token) {
  throw new Error(
    "Set NOTION_TOKEN to a Notion integration token with access to the Companies and Applications databases.",
  );
}

async function notion<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(
      `Notion request failed (${response.status}): ${json.message ?? "unknown error"}`,
    );
  }
  return json;
}

async function queryDatabase(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion<{
      results: NotionPage[];
      has_more: boolean;
      next_cursor?: string;
    }>(`/databases/${databaseId}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const plain = (property: NotionProperty | undefined) =>
  (property?.title ?? property?.rich_text ?? [])
    .map((part) => part.plain_text)
    .join("")
    .trim();
const url = (property: NotionProperty | undefined) =>
  property?.url?.trim() || "";
const isoDate = (value: string | null | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
const notesFrom = (lines: (string | undefined)[]) =>
  lines.filter((line): line is string => Boolean(line)).join("\n");

const companies = await queryDatabase(DATABASES.companies);
const applications = await queryDatabase(DATABASES.applications);
const companyIds = new Set(companies.map((company) => company.id));

const companyRows = companies.map((page) => {
  const status = page.properties["Research status"]?.select?.name ?? "";
  const people = plain(page.properties.People);
  const tags = page.properties.Tags?.multi_select?.map((tag) => tag.name) ?? [];
  return {
    id: page.id,
    name: plain(page.properties.Company),
    website: url(page.properties.Website),
    location: plain(page.properties["Country / State"]),
    status: COMPANY_STATUSES.includes(status)
      ? status
      : STATUS_FALLBACK.company,
    notes: notesFrom([
      plain(page.properties.Notes),
      people ? `Company size: ${people}` : undefined,
      tags.length ? `Tags: ${tags.join(", ")}` : undefined,
    ]),
    created_at: page.created_time,
    updated_at: page.last_edited_time,
  };
});

const applicationRows = applications.map((page) => {
  const status = page.properties.Status?.select?.name ?? "";
  const type = page.properties.Type?.select?.name ?? "";
  const companyId = page.properties.Company?.relation?.[0]?.id ?? "";
  const channels =
    page.properties["Channels used"]?.multi_select?.map(
      (channel) => channel.name,
    ) ?? [];
  return {
    id: page.id,
    title: plain(page.properties.Opportunity),
    company_id: companyId,
    status: APPLICATION_STATUSES.includes(status)
      ? status
      : STATUS_FALLBACK.application,
    type: type === "Job" || type === "Intern" ? type : null,
    description: "",
    location: "",
    employment_type: "",
    work_mode: "unknown",
    compensation: "",
    source_url: url(page.properties.Link),
    applied_on: null,
    contacted_on: isoDate(page.properties["Last contacted"]?.date?.start),
    follow_up_on: null,
    contact_name: "",
    contact_email: "",
    outcome: page.properties.Outcome?.select?.name ?? "",
    notes: notesFrom([
      channels.length ? `Channels used: ${channels.join(", ")}` : undefined,
    ]),
    created_at: page.created_time,
    updated_at: page.last_edited_time,
  };
});

const problems: string[] = [];
for (const company of companyRows) {
  if (!company.name) problems.push(`Company ${company.id} has no name.`);
}
for (const application of applicationRows) {
  if (!application.title)
    problems.push(`Application ${application.id} has no title.`);
  if (!application.company_id)
    problems.push(`Application ${application.id} has no company.`);
  else if (!companyIds.has(application.company_id))
    problems.push(
      `Application ${application.id} points at company ${application.company_id}, which is not in the Companies database.`,
    );
}
if (problems.length) {
  throw new Error(
    `Notion data cannot be imported:\n- ${problems.join("\n- ")}`,
  );
}

const profile = desktopProfilePaths(env.APP_ENV);
const apply = process.argv.includes("--apply");
const replace = process.argv.includes("--replace");
if (apply && replace && process.env.CONFIRM_TRACKER_IMPORT !== "1") {
  throw new Error(
    "Replacing tracker data requires CONFIRM_TRACKER_IMPORT=1 because it deletes existing tracker rows.",
  );
}
const database = new DatabaseSync(profile.database);
const count = (table: string) =>
  (
    database.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as {
      count: number;
    }
  ).count;

console.info(
  JSON.stringify(
    {
      mode: apply ? (replace ? "apply+replace" : "apply") : "preflight-only",
      database: profile.database,
      notion: {
        companies: companyRows.length,
        applications: applicationRows.length,
      },
      trackerBefore: {
        companies: count("tracker_companies"),
        applications: count("tracker_applications"),
      },
      replace,
      note: "Notion page ids are reused as tracker ids, so a re-run updates the same rows.",
    },
    null,
    2,
  ),
);
if (!apply) {
  console.info(
    "No data changed. Review this report before running with --apply.",
  );
  database.close();
  process.exit(0);
}

const companyStatement = database.prepare(
  `INSERT INTO tracker_companies(id,name,website,location,status,notes,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,website=excluded.website,
     location=excluded.location,status=excluded.status,notes=excluded.notes,
     updated_at=excluded.updated_at`,
);
const applicationStatement = database.prepare(
  `INSERT INTO tracker_applications(id,title,company_id,status,type,description,location,employment_type,work_mode,compensation,source_url,applied_on,contacted_on,follow_up_on,contact_name,contact_email,outcome,notes,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET title=excluded.title,company_id=excluded.company_id,
     status=excluded.status,type=excluded.type,description=excluded.description,
     location=excluded.location,employment_type=excluded.employment_type,
     work_mode=excluded.work_mode,compensation=excluded.compensation,
     source_url=excluded.source_url,applied_on=excluded.applied_on,
     contacted_on=excluded.contacted_on,follow_up_on=excluded.follow_up_on,
     contact_name=excluded.contact_name,contact_email=excluded.contact_email,
     outcome=excluded.outcome,notes=excluded.notes,updated_at=excluded.updated_at`,
);

database.exec("PRAGMA defer_foreign_keys = ON");
database.exec("BEGIN IMMEDIATE");
try {
  if (replace) {
    database.exec("DELETE FROM tracker_applications");
    database.exec("DELETE FROM tracker_companies");
  }
  for (const company of companyRows) {
    companyStatement.run(
      company.id,
      company.name,
      company.website,
      company.location,
      company.status,
      company.notes,
      company.created_at,
      company.updated_at,
    );
  }
  for (const application of applicationRows) {
    applicationStatement.run(
      application.id,
      application.title,
      application.company_id,
      application.status,
      application.type,
      application.description,
      application.location,
      application.employment_type,
      application.work_mode,
      application.compensation,
      application.source_url,
      application.applied_on,
      application.contacted_on,
      application.follow_up_on,
      application.contact_name,
      application.contact_email,
      application.outcome,
      application.notes,
      application.created_at,
      application.updated_at,
    );
  }
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  database.close();
  throw error;
}

const violations = database.prepare("PRAGMA foreign_key_check").all();
if (violations.length) {
  database.close();
  throw new Error("Foreign-key violations found after importing Notion data.");
}
const after = {
  companies: count("tracker_companies"),
  applications: count("tracker_applications"),
};
database.close();
console.info(
  JSON.stringify({ mode: "complete", trackerAfter: after }, null, 2),
);
