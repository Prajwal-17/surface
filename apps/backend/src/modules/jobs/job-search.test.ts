import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { runMigrations } from "../../infrastructure/database/migrate";
import { db } from "../../infrastructure/database/client";
import { applications } from "../applications/applications.tables";
import { companies } from "../workspace/workspace.tables";
import {
  jobSearchRuns,
  jobSearchSeen,
  jobSearchSettings,
} from "./job-search.tables";
import {
  getJobSearchSettings,
  runDueJobSearch,
  runJobSearch,
  saveJobSearchSettings,
} from "./job-search.service";

type Fixtures = {
  remotive?: Record<string, unknown>[];
  jobicy?: Record<string, unknown>[];
  arbeitnow?: Record<string, unknown>[];
  remoteOk?: Record<string, unknown>[];
  weWorkRemotely?: string;
  failHosts?: string[];
};

function fetchFixtures(fixtures: Fixtures) {
  return async (input: string) => {
    const host = new URL(input).hostname;
    if (fixtures.failHosts?.includes(host))
      throw new Error(`${host} is unavailable`);
    if (host === "remotive.com")
      return { body: JSON.stringify({ jobs: fixtures.remotive ?? [] }) };
    if (host === "jobicy.com")
      return { body: JSON.stringify({ jobs: fixtures.jobicy ?? [] }) };
    if (host === "www.arbeitnow.com")
      return { body: JSON.stringify({ data: fixtures.arbeitnow ?? [] }) };
    if (host === "remoteok.com")
      return { body: JSON.stringify(fixtures.remoteOk ?? []) };
    return {
      body:
        fixtures.weWorkRemotely ??
        "<rss><channel><title>Jobs</title></channel></rss>",
    };
  };
}

function remoteJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "acme-1",
    url: "https://jobs.acme.test/engineer",
    title: "Senior TypeScript Engineer",
    company_name: "Acme Robotics",
    company_url: "https://acme.test/",
    candidate_required_location: "India",
    description: "<p>Build TypeScript systems for product teams.</p>",
    publication_date: "2026-11-01T12:00:00Z",
    job_type: "full_time",
    tags: ["TypeScript"],
    ...overrides,
  };
}

async function configure(
  patch: Partial<{
    query: string;
    location: string;
    employmentType:
      | "any"
      | "full-time"
      | "part-time"
      | "contract"
      | "internship"
      | "temporary";
    remoteOnly: boolean;
    intervalMinutes: number;
    maxApplications: number;
    maxCompanies: number;
    enabled: boolean;
  }> = {},
) {
  return saveJobSearchSettings({
    query: "engineer",
    location: "",
    employmentType: "any",
    remoteOnly: false,
    intervalMinutes: 0,
    maxApplications: 10,
    maxCompanies: 5,
    enabled: false,
    ...patch,
  });
}

beforeAll(async () => {
  if (process.env.SQLITE_DATABASE_FILE !== ":memory:")
    throw new Error("Run this suite with an isolated in-memory database.");
  await runMigrations();
});

beforeEach(async () => {
  await db.delete(jobSearchSeen);
  await db.delete(jobSearchRuns);
  await db.delete(applications);
  await db.delete(companies);
  await db.delete(jobSearchSettings);
  await db.insert(jobSearchSettings).values({
    id: "default",
    updatedAt: new Date().toISOString(),
  });
});

describe("Job Search", () => {
  test("normalizes postings from all five feeds into the same result and company flow", async () => {
    await configure({
      query: "engineer",
      maxApplications: 10,
      maxCompanies: 10,
    });
    const now = new Date().toISOString();
    await db.insert(companies).values({
      id: crypto.randomUUID(),
      name: "Epsilon Systems",
      website: "https://epsilon.test",
      normalizedWebsite: "epsilon.test",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(companies).values({
      id: crypto.randomUUID(),
      name: "Acme Robotics",
      website: "https://acme.test",
      normalizedWebsite: "acme.test",
      createdAt: now,
      updatedAt: now,
    });
    const result = await runJobSearch(
      fetchFixtures({
        remotive: [remoteJob()],
        jobicy: [
          {
            id: "jobicy-1",
            url: "https://jobicy.com/jobs/1",
            jobTitle: "Backend Engineer",
            companyName: "Beta Systems",
            companyWebsite: "https://beta.test",
            jobGeo: "India",
            jobType: "full-time",
            jobDescription: "Build backend services.",
            pubDate: "2026-11-12T00:00:00Z",
          },
        ],
        arbeitnow: [
          {
            slug: "gamma-engineer",
            url: "https://www.arbeitnow.com/view/gamma-engineer",
            title: "Platform Engineer",
            company_name: "Gamma Works",
            company_url: "https://gamma.test",
            location: "Berlin",
            remote: false,
            job_types: ["full-time"],
            description: "Build platform systems.",
            created_at: "2026-11-11T00:00:00Z",
            tags: ["infrastructure"],
          },
        ],
        remoteOk: [
          {
            id: "remote-ok-2",
            position: "Cloud Engineer",
            company: "Delta Cloud",
            company_url: "https://delta.test",
            location: "Remote",
            url: "https://remoteok.com/remote-jobs/delta-cloud",
            date: "2026-11-13T00:00:00Z",
            description: "Operate cloud infrastructure.",
            tags: ["cloud"],
          },
        ],
        weWorkRemotely:
          "<rss><channel><title>Jobs</title><item><title>Epsilon Systems: QA Engineer</title><link>https://weworkremotely.com/remote-jobs/epsilon</link><guid>epsilon-1</guid><pubDate>Fri, 14 Nov 2026 00:00:00 GMT</pubDate><description>Quality engineering role.</description></item></channel></rss>",
      }),
    );
    expect(result.found).toBe(5);
    expect(result.insertedApplications).toBe(5);
    expect(result.insertedCompanies).toBe(3);
    expect(
      (await db.select().from(companies)).filter(
        (company) => company.normalizedWebsite === "acme.test",
      ),
    ).toHaveLength(1);
    expect(result.sources.map((source) => source.matched)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(
      new Set((await db.select().from(jobSearchSeen)).map((row) => row.source)),
    ).toEqual(
      new Set([
        "remotive",
        "jobicy",
        "arbeitnow",
        "remote-ok",
        "we-work-remotely",
      ]),
    );
  });

  test("filters by role, location, and job type", async () => {
    await configure({
      query: "typescript engineer",
      location: "India",
      employmentType: "full-time",
    });
    const matching = await runJobSearch(
      fetchFixtures({ remotive: [remoteJob()] }),
    );
    expect(matching.found).toBe(1);
    expect(matching.sources[0]?.matched).toBe(1);

    await configure({ location: "Brazil" });
    const wrongLocation = await runJobSearch(
      fetchFixtures({ remotive: [remoteJob()] }),
    );
    expect(wrongLocation.found).toBe(0);

    await configure({ employmentType: "part-time" });
    const wrongType = await runJobSearch(
      fetchFixtures({ remotive: [remoteJob()] }),
    );
    expect(wrongType.found).toBe(0);

    await configure({ query: "designer" });
    const wrongRole = await runJobSearch(
      fetchFixtures({ remotive: [remoteJob()] }),
    );
    expect(wrongRole.found).toBe(0);
  });

  test("enforces company and application caps and saves common posting fields", async () => {
    await configure({ maxApplications: 2, maxCompanies: 1 });
    const result = await runJobSearch(
      fetchFixtures({
        remotive: [
          remoteJob(),
          remoteJob({
            id: "other-1",
            url: "https://jobs.other.test/engineer",
            company_name: "Other Systems",
            company_url: "https://other.test",
          }),
        ],
      }),
    );
    expect(result.insertedApplications).toBe(1);
    expect(result.insertedCompanies).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.sources[0]?.skippedCompanyLimit).toBe(1);
    const savedCompanies = await db.select().from(companies);
    const savedApplications = await db.select().from(applications);
    expect(savedCompanies).toHaveLength(1);
    expect(savedCompanies[0]?.normalizedWebsite).toBe("acme.test");
    expect(savedApplications).toHaveLength(1);
    expect(savedApplications[0]?.sourceUrl).toBe(
      "https://jobs.acme.test/engineer",
    );
    expect(savedApplications[0]?.publishedAt).toBe("2026-11-01T12:00:00.000Z");
    expect(savedApplications[0]?.description).toContain(
      "Build TypeScript systems",
    );
    expect(savedApplications[0]?.status).toBe("queued");
    expect(savedApplications[0]?.notes).toBe("");
  });

  test("preserves the original posting link and does not change an existing application's status or notes", async () => {
    await configure();
    const remoteOk = [
      {
        id: "remote-ok-1",
        position: "Data Engineer",
        company: "Acme Robotics",
        company_url: "https://acme.test",
        location: "Remote",
        url: "https://remoteok.com/remote-jobs/1?utm_source=feed",
        apply_url: "https://jobs.acme.test/apply/1",
        date: "2026-11-10T00:00:00Z",
        description: "Build data systems.",
        tags: ["engineer"],
      },
    ];
    const first = await runJobSearch(fetchFixtures({ remoteOk }));
    expect(first.insertedApplications).toBe(1);
    const saved = (await db.select().from(applications))[0]!;
    expect(saved.sourceUrl).toBe(
      "https://remoteok.com/remote-jobs/1?utm_source=feed",
    );
    await db
      .update(applications)
      .set({ status: "applied", notes: "Already contacted" })
      .where(eq(applications.id, saved.id));

    const duplicate = await runJobSearch(fetchFixtures({ remoteOk }));
    expect(duplicate.insertedApplications).toBe(0);
    expect(duplicate.skipped).toBe(1);
    expect(duplicate.sources[3]?.skippedDuplicates).toBe(1);
    const unchanged = (await db.select().from(applications))[0]!;
    expect(unchanged.status).toBe("applied");
    expect(unchanged.notes).toBe("Already contacted");
    expect(await db.select().from(jobSearchSeen)).toHaveLength(1);
  });

  test("skips a posting when its company cannot be resolved", async () => {
    await configure({ query: "engineer" });
    const result = await runJobSearch(
      fetchFixtures({
        weWorkRemotely:
          "<rss><channel><title>Jobs</title><item><title>Confidential: Platform Engineer</title><link>https://weworkremotely.com/remote-jobs/unknown</link><guid>unknown-1</guid><description>Platform engineer role.</description></item></channel></rss>",
      }),
    );
    expect(result.found).toBe(1);
    expect(result.insertedApplications).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.sources[4]?.skippedUnresolvedCompanies).toBe(1);
    expect(await db.select().from(companies)).toHaveLength(0);
    expect(await db.select().from(applications)).toHaveLength(0);
  });

  test("creates a company from a clear feed name when no website is listed", async () => {
    await configure({ query: "engineer" });
    const result = await runJobSearch(
      fetchFixtures({
        remotive: [
          remoteJob({
            company_name: "BrightPath Labs",
            company_url: "",
          }),
        ],
      }),
    );
    const savedCompany = (await db.select().from(companies))[0];
    expect(result.insertedApplications).toBe(1);
    expect(result.insertedCompanies).toBe(1);
    expect(savedCompany?.name).toBe("BrightPath Labs");
    expect(savedCompany?.website).toBe("");
    expect(savedCompany?.normalizedWebsite).toBeNull();
  });

  test("reports postings left over after the application limit", async () => {
    await configure({ maxApplications: 1, maxCompanies: 5 });
    const result = await runJobSearch(
      fetchFixtures({
        remotive: [
          remoteJob(),
          remoteJob({
            id: "another-role",
            url: "https://jobs.other.test/engineer",
            company_name: "Other Systems",
            company_url: "https://other.test",
          }),
        ],
      }),
    );
    expect(result.insertedApplications).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.sources[0]?.skippedApplicationLimit).toBe(1);
  });

  test("reports failed feeds while keeping partial results", async () => {
    await configure();
    const result = await runJobSearch(
      fetchFixtures({
        remotive: [remoteJob()],
        failHosts: ["jobicy.com"],
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.insertedApplications).toBe(1);
    expect(
      result.sources.find((source) => source.key === "jobicy")?.error,
    ).toBe("jobicy.com is unavailable");
  });

  test("runs due schedules only when enabled and records the next run", async () => {
    await configure({ enabled: true, intervalMinutes: 60 });
    await db
      .update(jobSearchSettings)
      .set({ nextRunAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(jobSearchSettings.id, "default"));
    let fetchCount = 0;
    const fetcher = async (input: string) => {
      fetchCount++;
      return fetchFixtures({})(input);
    };
    await runDueJobSearch(new Date("2020-01-02T00:00:00.000Z"), fetcher);
    const scheduled = await getJobSearchSettings();
    expect(fetchCount).toBe(5);
    expect(scheduled.latestRun?.status).toBe("completed");
    expect(Date.parse(scheduled.nextRunAt ?? "") > Date.now()).toBe(true);

    await configure({ enabled: false, intervalMinutes: 0 });
    fetchCount = 0;
    await db
      .update(jobSearchSettings)
      .set({ nextRunAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(jobSearchSettings.id, "default"));
    await runDueJobSearch(new Date("2020-01-02T00:00:00.000Z"), fetcher);
    expect(fetchCount).toBe(0);
  });
});
