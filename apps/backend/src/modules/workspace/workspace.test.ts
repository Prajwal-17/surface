import { beforeAll, afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectSource } from "./source-inspection";
const directory = mkdtempSync(join(tmpdir(), "fieldwork-phase1-"));
process.env.DB_FILE_NAME = join(directory, "test.sqlite");
const { app } = await import("../../app");
const { runMigrations } = await import("../../infrastructure/database/migrate");
const { sqlite } = await import("../../infrastructure/database/client");
beforeAll(runMigrations);
afterAll(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});
const request = (path: string, data: unknown, method = "POST") =>
  app.request(`/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
test("URL inspection separates providers, board identity and unsupported URLs", () => {
  expect(inspectSource("https://boards.greenhouse.io/acme")).toMatchObject({
    provider: "greenhouse",
    boardIdentity: "acme",
    support: "supported",
  });
  expect(inspectSource("https://jobs.lever.co/acme").endpoint).toBe(
    "https://api.lever.co/v0/postings/acme?mode=json",
  );
  expect(inspectSource("https://jobs.ashbyhq.com/acme").provider).toBe("ashby");
  expect(inspectSource("https://www.linkedin.com/jobs/view/123").support).toBe(
    "unsupported",
  );
  expect(inspectSource("https://example.com/job/123").support).toBe(
    "unverified",
  );
  expect(() => inspectSource("file:///etc/passwd")).toThrow();
});
test("schema endpoint describes migrated tables and foreign keys", async () => {
  const response = await app.request("/api/schema");
  const body = (await response.json()) as {
    tables: {
      name: string;
      columns: { name: string; pk: number }[];
      foreignKeys: { from: string; table: string; to: string }[];
    }[];
  };
  const jobSources = body.tables.find(({ name }) => name === "job_sources");

  expect(response.status).toBe(200);
  expect(
    body.tables.find(({ name }) => name === "jobs")?.columns,
  ).toContainEqual(expect.objectContaining({ name: "id", pk: 1 }));
  expect(jobSources?.foreignKeys).toContainEqual(
    expect.objectContaining({ from: "job_id", table: "jobs", to: "id" }),
  );
});
test("profile revisions only change with relevant context and preserve legacy text and fits", async () => {
  const body = {
    targetRoles: "Engineer",
    preferredSkills: "Bun",
    locationPreferences: "India preferred",
    dealBreakers: "No night shifts",
    context: {},
  };
  let response = await request("profile/context", body, "PUT");
  expect(response.status).toBe(200);
  const first = (await response.json()).profile;
  response = await request("profile/context", body, "PUT");
  expect((await response.json()).profile.revision).toBe(first.revision);
  response = await request(
    "profile/context",
    { ...body, context: { growthInterests: "Systems" } },
    "PUT",
  );
  expect((await response.json()).profile.revision).toBe(first.revision + 1);
  const current = await (await app.request("/api/profile/context")).json();
  expect(current.profile.locationPreferences).toBe(body.locationPreferences);
  expect(
    sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='clear_job_fits_after_preferences_update'",
      )
      .get(),
  ).toBeNull();
});
test("company archival and source pausing retain independent source records", async () => {
  const company = await (await request("companies", { name: "Acme" })).json();
  const source = await (
    await request("sources", {
      url: "https://jobs.lever.co/acme",
      companyId: company.id,
    })
  ).json();
  expect(source.provider).toBe("lever");
  expect(
    (
      await request(
        `companies/${company.id}`,
        { ...company, archived: true },
        "PUT",
      )
    ).status,
  ).toBe(200);
  expect(
    (await request(`sources/${source.id}`, { ...source, paused: true }, "PUT"))
      .status,
  ).toBe(200);
  const rows = await (await app.request("/api/sources")).json();
  expect(rows.filter((r: { id: string }) => r.id === source.id)).toHaveLength(
    1,
  );
  expect(rows.find((r: { id: string }) => r.id === source.id).paused).toBe(
    true,
  );
  expect((await request("sources", { url: source.url })).status).toBe(409);
  expect(
    (
      await request("sources", {
        url: "https://example.com/job",
        companyId: "missing",
      })
    ).status,
  ).toBe(400);
});

const { extractPage, extractAts, descriptionContent } =
  await import("../collection/extraction");
const { collectSource } = await import("../collection/collection.service");
const { upsertCandidates, findJobById } =
  await import("../jobs/jobs.repository");
const { decideDuplicate } = await import("../jobs/duplicates");
const { isPublicAddress } = await import("../collection/public-http");
const { configuredSourceSchema } = await import("../../shared/contracts");
const sourceFixture = (url = "https://jobs.lever.co/fixture") =>
  configuredSourceSchema.parse({
    ...inspectSource(url),
    id: "fixture-source",
    companyId: null,
    label: "Fixture",
    paused: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
const longDescription =
  "Build reliable TypeScript services for users. Own deployments and incident response, work with product and design, review changes with engineers, improve observability and test coverage, and document architectural decisions for a distributed team. ";
const candidateFixture = () => ({
  source: "remotive" as const,
  externalId: crypto.randomUUID(),
  title: "Fixture engineer",
  company: "Fixture employer",
  location: "Remote",
  isRemote: true,
  employmentType: "full-time",
  description: longDescription,
  applyUrl: `https://example.com/jobs/${crypto.randomUUID()}`,
  sourceUrl: `https://remotive.com/jobs/${crypto.randomUUID()}`,
  postedAt: null,
  tags: [],
});
test("JSON-LD and microdata preserve readable safe descriptions and unknown dates", () => {
  const source = sourceFixture("https://example.com/job/1");
  const [job] = extractPage(
    source,
    `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Engineer", hiringOrganization: { name: "Acme" }, description: "<p>First paragraph.</p><ul><li>Build APIs</li></ul><script>alert(1)</script><img src=x onerror=alert(1)>", applicantLocationRequirements: [{ "@type": "Country", name: "India" }] }).replaceAll("<", "\\u003c")}</script>`,
  );
  expect(job!.description).toContain("First paragraph.\n\nBuild APIs");
  expect(job!.descriptionHtml).not.toContain("script");
  expect(job!.descriptionHtml).not.toContain("onerror");
  expect(job!.postedAt).toBeNull();
  expect(job!.countries).toEqual(["India"]);
  expect(() =>
    extractPage(source, "<h1>Engineer at Acme</h1><p>Some arbitrary text.</p>"),
  ).toThrow("no explicit job data");
  expect(() => extractPage(source, '<input type="password">')).toThrow("login");
  expect(
    extractPage(
      source,
      '<article itemscope itemtype="https://schema.org/JobPosting"><h1 itemprop="title">Engineer</h1><div itemprop="description">Short</div></article>',
    )[0]!.incomplete,
  ).toBe(true);
  expect(
    descriptionContent("&lt;p&gt;Encoded paragraph&lt;/p&gt;").description,
  ).toBe("Encoded paragraph");
});
test("ATS pagination follows Lever skip/limit; a failed later page is partial", async () => {
  const calls: string[] = [];
  const source = sourceFixture();
  const fetcher = async (url: string) => {
    calls.push(url);
    const page = new URL(url).searchParams.get("skip");
    return {
      url,
      statusCode: 200,
      mediaType: "application/json",
      body: JSON.stringify(
        page === "0"
          ? Array.from({ length: 100 }, (_, id) => ({
              id,
              text: `Engineer ${id}`,
              hostedUrl: `https://jobs.lever.co/fixture/${id}`,
              description: longDescription,
              company_name: "Fixture",
            }))
          : [],
      ),
    };
  };
  const result = await collectSource(source, fetcher, () => ({
    snapshotId: "test",
    resourceId: "test",
  }));
  expect(calls).toHaveLength(2);
  expect(calls[1]).toContain("skip=100");
  expect(result.complete).toBe(true);
  expect(result.candidates).toHaveLength(100);
  let count = 0;
  const partial = await collectSource(
    source,
    async (url) => {
      if (count++ > 0) throw new Error("timeout");
      return fetcher(url);
    },
    () => ({ snapshotId: "test", resourceId: "test" }),
  );
  expect(partial.complete).toBe(false);
  expect(partial.error).toBe("timeout");
  expect(partial.candidates).toHaveLength(100);
  expect(() => extractAts(source, { error: "rate limit" })).toThrow(
    "Malformed ATS",
  );
});
test("repeated and cross-site observations create one logical job and do not version tracking changes", () => {
  const first = candidateFixture();
  upsertCandidates([first]);
  const id = (
    sqlite
      .query("SELECT id FROM jobs WHERE title=? AND company=?")
      .get(first.title, first.company) as { id: string }
  ).id;
  const version = findJobById(id)!.currentVersionId;
  upsertCandidates([
    { ...first, applyUrl: `${first.applyUrl}?utm_source=newsletter` },
  ]);
  expect(findJobById(id)!.currentVersionId).toBe(version);
  upsertCandidates([
    {
      ...first,
      source: "remote-ok",
      externalId: "cross-site",
      sourceUrl: "https://remoteok.com/job/cross-site",
      applyUrl: "https://remoteok.com/job/cross-site",
    },
  ]);
  expect(findJobById(id)!.sourceReferences).toHaveLength(2);
  expect(findJobById(id)!.currentVersionId).toBe(version);
  upsertCandidates([
    {
      ...first,
      description: `${first.description} Experience with SQL is required.`,
    },
  ]);
  expect(findJobById(id)!.versions).toHaveLength(2);
});
test("similar jobs stay distinct and manual merge is reversible", () => {
  const first = { ...candidateFixture(), title: "Separate role" };
  const second = {
    ...candidateFixture(),
    title: "Separate role",
    description:
      "A substantively different job involving accounting and operations.",
    source: "remote-ok" as const,
  };
  upsertCandidates([first, second]);
  const rows = sqlite
    .query("SELECT id FROM jobs WHERE title='Separate role'")
    .all() as { id: string }[];
  expect(rows).toHaveLength(2);
  const decision = findJobById(rows[0]!.id)!.duplicates[0]!;
  expect(decision.state).toBe("possible");
  decideDuplicate(decision.id, "separate");
  upsertCandidates([first, second]);
  expect(findJobById(rows[0]!.id)!.duplicates[0]!.state).toBe("separate");
  decideDuplicate(decision.id, "merge");
  expect(findJobById(decision.leftId)!.sourceReferences).toHaveLength(2);
  decideDuplicate(decision.id, "undo");
  expect(findJobById(decision.leftId)!.sourceReferences).toHaveLength(1);
  expect(findJobById(decision.rightId)!.sourceReferences).toHaveLength(1);
});
test("private and reserved addresses are rejected, including mapped IPv6", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.2",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])
    expect(isPublicAddress(ip)).toBe(false);
  expect(isPublicAddress("1.1.1.1")).toBe(true);
  expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
});
test("Greenhouse and Ashby retain unknown dates and structured salary; RSS accepts one item", async () => {
  const greenhouse = sourceFixture("https://boards.greenhouse.io/acme");
  const [gh] = extractAts(
    greenhouse,
    {
      jobs: [
        {
          id: 42,
          title: "Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
          content: "<p>Build things.</p>",
          updated_at: "2026-01-01",
        },
      ],
    },
    "Acme",
  );
  expect(gh!.postedAt).toBeNull();
  expect(gh!.boardIdentity).toBe("acme");
  const ashby = sourceFixture("https://jobs.ashbyhq.com/acme");
  const [ash] = extractAts(
    ashby,
    {
      jobs: [
        {
          title: "Engineer",
          jobUrl: "https://jobs.ashbyhq.com/acme/42",
          workplaceType: "Remote",
          descriptionHtml: "<ul><li>Build</li></ul>",
          compensation: {
            summaryComponents: [
              {
                compensationType: "Salary",
                currencyCode: "USD",
                interval: "1 YEAR",
                minValue: 80000,
                maxValue: 100000,
              },
            ],
          },
        },
      ],
    },
    "Acme",
  );
  expect(ash!.compensation).toMatchObject({
    currency: "USD",
    min: 80000,
    max: 100000,
    period: "year",
  });
  expect(ash!.countries).toEqual([]);
  const { weWorkRemotelySource } =
    await import("../discovery/sources/we-work-remotely.source");
  expect(
    weWorkRemotelySource.extract(
      "<rss><channel><item><title>Acme: Engineer</title><link>https://example.com/job/1</link><description>Build</description></item></channel></rss>",
    ).jobs,
  ).toHaveLength(1);
  expect(() => weWorkRemotelySource.extract("not XML")).toThrow();
});
const { enqueueCollection, getRun, enqueueDueSchedules } =
  await import("../work/work.service");
const { executeCollection, recordInventory, recoverInterruptedWork } =
  await import("../work/executor");
test("collection submissions persist, share active and recent work, and do not overlap", async () => {
  const source = await (
    await request("sources", {
      url: "https://boards.greenhouse.io/work-test",
      scheduleHours: 0,
    })
  ).json();
  const one = enqueueCollection([source.id]);
  const two = enqueueCollection([source.id]);
  const item = getRun(one.runId).items[0]!;
  expect(getRun(two.runId).items[0]!.id).toBe(item.id);
  expect((await request(`sources/${source.id}/refresh`, {})).status).toBe(202);
  const job = { ...candidateFixture(), configuredSourceId: source.id };
  await executeCollection(item, async () => ({
    candidates: [job],
    complete: true,
    error: null,
  }));
  expect(getRun(one.runId).state).toBe("completed");
  expect(getRun(two.runId).state).toBe("completed");
  const three = enqueueCollection([source.id]);
  expect(getRun(three.runId).items[0]!.id).toBe(item.id);
});
test("only complete inventories establish absence; another observation keeps a logical job open", () => {
  const first = {
    ...candidateFixture(),
    title: "Disappearance fixture",
    configuredSourceId: "absence-a",
  };
  upsertCandidates([first]);
  upsertCandidates([
    {
      ...first,
      source: "remote-ok",
      externalId: "absence-b",
      configuredSourceId: "absence-b",
      sourceUrl: "https://remoteok.com/absence",
      applyUrl: "https://remoteok.com/absence",
    },
  ]);
  const row = sqlite
    .query("SELECT id FROM jobs WHERE title='Disappearance fixture'")
    .get() as { id: string };
  recordInventory("absence-a", {
    candidates: [],
    complete: false,
    error: "timeout",
  });
  expect(findJobById(row.id)!.sourceReferences[0]!.missingChecks).toBe(0);
  recordInventory("absence-a", { candidates: [], complete: true, error: null });
  expect(findJobById(row.id)!.sourceReferences[0]!.availability).toBe(
    "missing",
  );
  recordInventory("absence-a", { candidates: [], complete: true, error: null });
  recordInventory("absence-a", { candidates: [], complete: true, error: null });
  expect(findJobById(row.id)!.availability).toBe("open");
  for (let i = 0; i < 3; i++)
    recordInventory("absence-b", {
      candidates: [],
      complete: true,
      error: null,
    });
  expect(findJobById(row.id)!.availability).toBe("closed");
});
test("restart marks running work interrupted, keeps queued work, and resumes an overdue schedule once", async () => {
  const source = await (
    await request("sources", {
      url: "https://boards.greenhouse.io/restart-test",
      scheduleHours: 12,
    })
  ).json();
  const run = enqueueCollection([source.id]);
  const item = getRun(run.runId).items[0]!;
  sqlite.query("UPDATE work_items SET state='running' WHERE id=?").run(item.id);
  recoverInterruptedWork();
  expect(getRun(run.runId).state).toBe("interrupted");
  sqlite
    .query(
      "UPDATE configured_sources SET next_due_at='2020-01-01T00:00:00.000Z' WHERE id=?",
    )
    .run(source.id);
  const before = (
    sqlite.query("SELECT count(*) n FROM runs").get() as { n: number }
  ).n;
  enqueueDueSchedules();
  enqueueDueSchedules();
  expect(
    (sqlite.query("SELECT count(*) n FROM runs").get() as { n: number }).n,
  ).toBe(before + 1);
  expect(
    (
      sqlite
        .query(
          "SELECT count(*) n FROM work_items WHERE identity=? AND state='queued'",
        )
        .get(`source:${source.id}`) as { n: number }
    ).n,
  ).toBe(1);
});
test("rate limits persist retry timing and manual refresh cannot bypass it", async () => {
  const source = await (
    await request("sources", {
      url: "https://boards.greenhouse.io/rate-test",
      scheduleHours: 0,
    })
  ).json();
  const run = enqueueCollection([source.id]);
  const item = getRun(run.runId).items[0]!;
  const { FetchFailure } = await import("../collection/public-http");
  const retry = new Date(Date.now() + 86400000).toISOString();
  await executeCollection(item, async () => {
    throw new FetchFailure("Source returned HTTP 429.", retry, 429);
  });
  const current = getRun(run.runId).items[0]!;
  expect(current.state).toBe("queued");
  expect(current.retryAt >= retry).toBe(true);
  expect(getRun(enqueueCollection([source.id]).runId).items[0]!.retryAt).toBe(
    current.retryAt,
  );
});
const { checkEligibility } = await import("../analysis/eligibility");
const { getSettings, saveSettings, reserveRequest, nextReset } =
  await import("../analysis/allowance");
const { enqueueAnalysis, executeAnalysis } =
  await import("../analysis/analysis.service");
const { personalContextSchema, assessmentOutputSchema } =
  await import("../../shared/contracts");
const { findProfile, saveProfile } =
  await import("../profile/profile.repository");
const { validateAssessment, assessmentContext } =
  await import("../analysis/model");
const outputFixture = () =>
  assessmentOutputSchema.parse({
    score: 80,
    summary: "This looks worth reviewing, with unresolved details.",
    skillsFit: [],
    growthPotential: [],
    strengths: [
      {
        text: "The title is an engineering role.",
        kind: "fact",
        jobEvidence: { field: "title", quote: "Engineer" },
        profileEvidence: null,
      },
    ],
    concerns: [],
    unansweredQuestions: ["Confirm work eligibility."],
    projectEvidence: [],
  });
test("hard constraints confirm only explicit comparable mismatches", () => {
  const context = personalContextSchema.parse({
    constraints: {
      countries: ["India"],
      workMode: "remote",
      minimumSalary: 100000,
      currency: "USD",
      salaryPeriod: "year",
    },
  });
  const job = {
    workMode: "unknown" as const,
    countries: [],
    employmentType: null,
    compensation: null,
  };
  expect(checkEligibility(job, context).state).toBe("clarify");
  expect(checkEligibility({ ...job, workMode: "onsite" }, context).state).toBe(
    "conflicts",
  );
  expect(
    checkEligibility({ ...job, workMode: "remote", countries: ["US"] }, context)
      .state,
  ).toBe("conflicts");
  expect(
    checkEligibility(
      {
        ...job,
        workMode: "remote",
        countries: ["IN"],
        compensation: {
          min: 120000,
          max: 140000,
          currency: "USD",
          period: "year",
          original: "fixture",
        },
      },
      context,
    ).state,
  ).toBe("meets");
  expect(
    checkEligibility(
      {
        ...job,
        workMode: "remote",
        countries: ["IN"],
        compensation: {
          min: 120000,
          max: 140000,
          currency: "INR",
          period: "year",
          original: "fixture",
        },
      },
      context,
    ).state,
  ).toBe("clarify");
});
test("persisted allowance counts every reservation and cannot be reset by settings edits", () => {
  saveSettings({ dailyLimit: 2, paused: false, timezone: "Asia/Kolkata" });
  expect(reserveRequest("quota-one", true)).not.toBeNull();
  expect(reserveRequest("quota-two", true)).not.toBeNull();
  expect(reserveRequest("quota-three", true)).toBeNull();
  const secondConnection = new (require("bun:sqlite").Database)(
    process.env.DB_FILE_NAME!,
  );
  expect(
    secondConnection
      .query("SELECT used FROM analysis_settings WHERE id='me'")
      .get().used,
  ).toBe(2);
  secondConnection.close();
  const reset = getSettings().nextResetAt;
  saveSettings({ dailyLimit: 2, paused: false, timezone: "UTC" });
  expect(getSettings().used).toBe(2);
  expect(getSettings().nextResetAt).toBe(reset);
  expect(reserveRequest("quota-retry", true)).toBeNull();
  expect(
    nextReset("Asia/Kolkata", Date.parse("2026-09-07T10:00:00.000Z")),
  ).toBe("2026-09-07T18:30:00.000Z");
  saveSettings({ dailyLimit: 100, paused: false, timezone: "Asia/Kolkata" });
});
test("AI saves each successful assessment despite other failures and deduplicates analysis identity", async () => {
  const first = { ...candidateFixture(), title: "Engineer AI success" },
    second = { ...candidateFixture(), title: "Engineer AI failure" };
  upsertCandidates([first, second]);
  const run = enqueueAnalysis(true)!;
  const items = getRun(run.runId).items.filter((item) => {
    const job = findJobById(item.jobId!);
    return job?.title === first.title || job?.title === second.title;
  });
  expect(items).toHaveLength(2);
  const success = items.find(
    (item) => findJobById(item.jobId!)?.title === first.title,
  )!;
  const failure = items.find((item) => item.id !== success.id)!;
  await Promise.all([
    executeAnalysis(
      success,
      async () => ({ output: outputFixture(), model: "fixture" }),
      true,
    ),
    executeAnalysis(
      failure,
      async () => {
        throw new Error("Invalid output");
      },
      true,
    ),
  ]);
  expect(findJobById(success.jobId!)!.assessmentState).toBe("current");
  expect(
    getRun(run.runId).items.find((item) => item.id === failure.id)!.error,
  ).toBe("Invalid output");
  enqueueAnalysis();
  expect(
    (
      sqlite
        .query("SELECT count(*) n FROM assessments WHERE job_id=?")
        .get(success.jobId!) as { n: number }
    ).n,
  ).toBe(1);
  const before = getSettings().used;
  saveSettings({ dailyLimit: before, paused: false, timezone: "Asia/Kolkata" });
  await executeAnalysis(
    getRun(run.runId).items.find((item) => item.id === failure.id)!,
    async () => {
      throw new Error("Should not dispatch");
    },
    true,
  );
  expect(getSettings().used).toBe(before);
  saveSettings({ dailyLimit: 100, paused: false, timezone: "Asia/Kolkata" });
});
test("profile or job changes during analysis discard in-flight results", async () => {
  for (const change of ["profile", "job"]) {
    const candidate = {
      ...candidateFixture(),
      title: `Engineer stale ${change}`,
    };
    upsertCandidates([candidate]);
    const row = sqlite
      .query("SELECT id FROM jobs WHERE title=?")
      .get(candidate.title) as { id: string };
    const run = enqueueAnalysis(true, [row.id])!;
    const item = getRun(run.runId).items[0]!;
    await executeAnalysis(
      item,
      async () => {
        if (change === "profile") {
          const profile = findProfile()!;
          saveProfile({
            ...profile,
            preferredSkills: `${profile.preferredSkills}, distributed systems`,
          });
        } else
          upsertCandidates([
            {
              ...candidate,
              description: `${candidate.description} Changed actual duties.`,
            },
          ]);
        return { output: outputFixture(), model: "fixture" };
      },
      true,
    );
    expect(findJobById(row.id)!.assessment).toBeNull();
    expect(getRun(run.runId).items[0]!.state).toBe("interrupted");
  }
});
test("factual citations must match exact supplied fields; output cannot request actions", () => {
  const row = sqlite
    .query("SELECT id FROM jobs WHERE title='Engineer AI success'")
    .get() as { id: string };
  const { db } = require("../../infrastructure/database/client");
  const { jobs } = require("../jobs/jobs.tables");
  const { eq } = require("drizzle-orm");
  const job = db.select().from(jobs).where(eq(jobs.id, row.id)).get();
  const context = assessmentContext(findProfile()!, job);
  expect(() =>
    validateAssessment(
      {
        ...outputFixture(),
        strengths: [
          {
            text: "Invented salary",
            kind: "fact",
            jobEvidence: { field: "compensation", quote: "200000 USD" },
            profileEvidence: null,
          },
        ],
      },
      context,
    ),
  ).toThrow("does not match");
  expect(() =>
    validateAssessment({ ...outputFixture(), action: "dismiss" }, context),
  ).toThrow();
  expect(() =>
    validateAssessment(
      {
        ...outputFixture(),
        strengths: [
          {
            text: "Unsupported fact",
            kind: "fact",
            jobEvidence: null,
            profileEvidence: null,
          },
        ],
      },
      context,
    ),
  ).toThrow("no supporting evidence");
});
test("automatic enqueue does not backfill unrequested jobs and source-only observations do not invalidate assessments", async () => {
  sqlite.query("UPDATE jobs SET analysis_requested=0").run();
  const candidate = {
    ...candidateFixture(),
    title: "Engineer automatic fixture",
  };
  upsertCandidates([candidate]);
  const row = sqlite
    .query("SELECT id FROM jobs WHERE title=?")
    .get(candidate.title) as { id: string };
  const run = enqueueAnalysis()!;
  expect(run).not.toBeNull();
  expect(getRun(run.runId).items).toHaveLength(1);
  await executeAnalysis(
    getRun(run.runId).items[0]!,
    async () => ({ output: outputFixture(), model: "fixture" }),
    true,
  );
  const version = findJobById(row.id)!.currentVersionId;
  upsertCandidates([
    {
      ...candidate,
      source: "remote-ok",
      externalId: "automatic-secondary",
      sourceUrl: "https://remoteok.com/job/automatic",
      applyUrl: "https://remoteok.com/job/automatic",
    },
  ]);
  expect(findJobById(row.id)!.currentVersionId).toBe(version);
  expect(findJobById(row.id)!.assessmentState).toBe("current");
  expect(enqueueAnalysis()).toBeNull();
});
test("direct ATS posting URLs fetch only that posting and cannot establish a complete inventory", async () => {
  const source = sourceFixture("https://jobs.lever.co/acme/one-posting");
  expect(source.provider).toBe("lever");
  const requested: string[] = [];
  const result = await collectSource(
    source,
    async (url) => {
      requested.push(url);
      return {
        url,
        mediaType: "application/json",
        statusCode: 200,
        body: JSON.stringify({
          id: "one-posting",
          text: "Engineer",
          hostedUrl: "https://jobs.lever.co/acme/one-posting",
          description: longDescription,
          company_name: "Acme",
        }),
      };
    },
    () => ({ resourceId: "fixture", snapshotId: "fixture" }),
  );
  expect(requested).toHaveLength(1);
  expect(requested[0]).not.toContain("skip");
  expect(result.candidates).toHaveLength(1);
  expect(result.complete).toBe(false);
});
test("snapshot cleanup retains the latest per URL and marks removed evidence", async () => {
  const { persistSnapshot, snapshotDirectory } =
    await import("../collection/snapshots");
  const { cleanupSnapshots } = await import("../collection/cleanup");
  const old = persistSnapshot({
    url: "https://example.com/cleanup",
    body: "old",
    mediaType: "text/plain",
    statusCode: 200,
  });
  sqlite
    .query("UPDATE snapshots SET fetched_at='2020-01-01' WHERE id=?")
    .run(old.snapshotId);
  const current = persistSnapshot({
    url: "https://example.com/cleanup",
    body: "new",
    mediaType: "text/plain",
    statusCode: 200,
  });
  expect(cleanupSnapshots().files).toBe(1);
  expect(cleanupSnapshots(true).files).toBe(1);
  expect(
    (await app.request(`/api/snapshots/${old.snapshotId}/download`)).status,
  ).toBe(410);
  const response = await app.request(
    `/api/snapshots/${current.snapshotId}/download`,
  );
  expect(await response.text()).toBe("new");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(
    sqlite
      .query("SELECT * FROM snapshots WHERE id=? AND removed_at IS NOT NULL")
      .get(old.snapshotId),
  ).not.toBeNull();
});
test("review state is independent of saved decisions and content versions", async () => {
  const candidate = { ...candidateFixture(), title: "Review state fixture" };
  upsertCandidates([candidate]);
  const row = sqlite
    .query("SELECT id FROM jobs WHERE title=?")
    .get(candidate.title) as { id: string };
  const before = findJobById(row.id)!;
  await request(`jobs/${row.id}/status`, { status: "saved" }, "PATCH");
  const response = await request(
    `jobs/${row.id}/review`,
    { reviewed: true },
    "PATCH",
  );
  const reviewed = await response.json();
  expect(reviewed.status).toBe("saved");
  expect(reviewed.reviewState).toBe("reviewed");
  expect(reviewed.currentVersionId).toBe(before.currentVersionId);
  const restored = await (
    await request(`jobs/${row.id}/review`, { reviewed: false }, "PATCH")
  ).json();
  expect(restored.status).toBe("saved");
  expect(restored.reviewedAt).toBeNull();
});

test("profile catalogs provide global locations, distinguish cities, and reject fabricated selections", async () => {
  const catalogs = await (await app.request("/api/profile/catalogs")).json();
  expect(catalogs.countries.length).toBeGreaterThan(240);
  expect(catalogs.currencies).toContain("INR");
  const india = await (
    await app.request("/api/profile/locations?country=IN&q=Mumbai")
  ).json();
  expect(
    india.items.some((v: { label: string }) => v.label.includes("Maharashtra")),
  ).toBe(true);
  const city = india.items[0];
  const profile = findProfile()!;
  const badCity = await request(
    "profile/context",
    {
      ...profile,
      context: {
        ...profile.context,
        details: { residence: { countryCode: "US", cityId: city.cityId } },
      },
    },
    "PUT",
  );
  expect(badCity.status).toBe(400);
  expect(
    (
      await request(
        "profile/context",
        {
          ...profile,
          context: {
            ...profile.context,
            details: { roles: ["a made-up dropdown option"] },
          },
        },
        "PUT",
      )
    ).status,
  ).toBe(400);
  expect((await app.request("/api/profile/locations?country=XX")).status).toBe(
    400,
  );
  expect(
    (await app.request("/api/profile/locations?country=US&offset=-1")).status,
  ).toBe(400);
  const page = await (
    await app.request("/api/profile/locations?country=US")
  ).json();
  expect(page.items.length).toBe(30);
  expect(page.more).toBe(true);
});

test("complete personal evidence, including late projects, reaches the assessment and can be cited", async () => {
  const { db } = await import("../../infrastructure/database/client");
  const { jobs } = await import("../jobs/jobs.tables");
  const profile = structuredClone(findProfile()!);
  profile.context.experience =
    "Detailed experience. ".repeat(1000) + "Final achievement retained.";
  profile.context.projects = Array.from({ length: 8 }, (_, i) => ({
    title: `Project ${i}`,
    url: "",
    technologies: "SQLite",
    contribution: "Built reliable migrations. ".repeat(200),
    results: `Outcome ${i}`,
  }));
  const context = assessmentContext(profile, db.select().from(jobs).get()!);
  expect(context.profile.experience).toEndWith("Final achievement retained.");
  expect(context.profile["projects.7"]).toContain("Outcome 7");
  expect(context.profile["projects.7"]!.length).toBeGreaterThan(3000);
  const output = outputFixture();
  output.strengths = [
    {
      kind: "fact",
      text: "Relevant project outcome",
      jobEvidence: null,
      profileEvidence: { field: "projects.7", quote: "Outcome 7" },
    },
  ];
  expect(() => validateAssessment(output, context)).not.toThrow();
});

test("profile updates preserve existing notes and reject stale editors", async () => {
  const before = findProfile()!;
  const { profileDetailsSchema } = await import("../../shared/contracts");
  const details = profileDetailsSchema.parse({
    roles: ["Backend engineer"],
    skills: ["TypeScript"],
    learningSkills: ["Go"],
  });
  const result = await request(
    "profile/context",
    {
      ...before,
      expectedRevision: before.revision,
      context: { ...before.context, details },
    },
    "PUT",
  );
  expect(result.status).toBe(200);
  const after = (await result.json()).profile;
  expect(after.locationPreferences).toBe(before.locationPreferences);
  expect(after.dealBreakers).toBe(before.dealBreakers);
  expect(after.context.details.learningSkills).toEqual(["Go"]);
  expect(after.revision).toBe(before.revision + 1);
  expect(
    (
      await request(
        "profile/context",
        { ...before, expectedRevision: before.revision },
        "PUT",
      )
    ).status,
  ).toBe(409);
  expect(findProfile()!.revision).toBe(after.revision);
});

test("résumé extraction preserves exact evidence and cannot invent facts or preferences", async () => {
  const { validateResumeExtraction } = await import("../profile/resume");
  const source =
    "Alex Smith\nBackend engineer at Example, 2021–2025.\nBuilt APIs in TypeScript.\nBSc Computer Science.";
  const raw = {
    name: "Alex Smith",
    location: null,
    experience: [
      "Backend engineer at Example, 2021–2025.",
      "Built APIs in TypeScript.",
    ],
    education: ["BSc Computer Science."],
    skills: [{ skill: "TypeScript", evidence: "TypeScript" }],
    projects: [],
    unmatched: [],
  };
  const draft = validateResumeExtraction(raw, source);
  expect(draft.experience).toContain("2021–2025");
  expect(draft.skills).toEqual(["TypeScript"]);
  expect(draft).not.toHaveProperty("targetRoles");
  expect(draft).not.toHaveProperty("constraints");
  expect(() =>
    validateResumeExtraction(
      { ...raw, experience: ["Managed 100 engineers"] },
      source,
    ),
  ).toThrow();
  expect(() =>
    validateResumeExtraction(
      { ...raw, skills: [{ skill: "TypeScript", evidence: "" }] },
      source,
    ),
  ).toThrow();
  const previous = findProfile()!;
  const malformed = new FormData();
  malformed.append(
    "file",
    new File(["not a PDF"], "resume.pdf", { type: "application/pdf" }),
  );
  expect(
    (
      await app.request("/api/profile/resume", {
        method: "POST",
        body: malformed,
      })
    ).status,
  ).toBe(400);
  expect(findProfile()!.revision).toBe(previous.revision);
});

test("PDF upload reads text without retaining the file", async () => {
  const { pdfText } = await import("../profile/resume");
  const lines = [
    "Alex Smith",
    "Backend engineer at Example",
    "Built APIs with TypeScript and SQLite.",
  ];
  const stream = `BT /F1 12 Tf 50 740 Td ${lines.map((line, i) => `${i ? "0 -20 Td " : ""}(${line}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const text = await pdfText(
    new File([pdf], "fixture.pdf", { type: "application/pdf" }),
  );
  expect(text).toContain("Alex Smith");
  expect(text).toContain("TypeScript");
});

test("résumé prefill charges its allowance but leaves the saved profile untouched", async () => {
  const { prefillResume } = await import("../profile/resume");
  const before = findProfile()!;
  saveSettings({ dailyLimit: 1000, timezone: "Asia/Kolkata", paused: true });
  const used = getSettings().used;
  const source =
    "Alex Smith\nLives in Mumbai, Maharashtra, India.\nBuilt backend APIs in TypeScript.";
  const result = await prefillResume(
    source,
    async (schema) => ({
      model: "fixture",
      output: schema.parse({
        name: "Alex Smith",
        location: {
          city: "Mumbai",
          region: "Maharashtra",
          country: "India",
          evidence: "Lives in Mumbai, Maharashtra, India.",
        },
        experience: ["Built backend APIs in TypeScript."],
        education: [],
        skills: [{ skill: "TypeScript", evidence: "TypeScript" }],
        projects: [],
        unmatched: [],
      }),
    }),
    true,
  );
  expect(result.draft.residence?.countryCode).toBe("IN");
  expect(result.draft.residence?.cityId).toBeNumber();
  expect(findProfile()).toEqual(before);
  expect(getSettings().used).toBe(used + 1);
  expect(getSettings().paused).toBe(true);
  await expect(
    prefillResume(
      source,
      async () => {
        throw new Error("Provider failure");
      },
      true,
    ),
  ).rejects.toThrow("Provider failure");
  expect(getSettings().used).toBe(used + 2);
  expect(findProfile()).toEqual(before);
});

test("model concurrency is shared by imports and assessments and released after failures", async () => {
  const { requestModelJson, modelCapacityAvailable } =
    await import("../../shared/model-client");
  const originalFetch = globalThis.fetch;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fakeFetch = async () => {
    await gate;
    return Response.json({
      model: "fixture",
      choices: [{ message: { content: "not JSON" } }],
    });
  };
  globalThis.fetch = Object.assign(fakeFetch, {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch;
  try {
    const schema = assessmentOutputSchema;
    const first = requestModelJson(schema, "test", "test", {}, 100).catch(
      () => null,
    );
    const second = requestModelJson(schema, "test", "test", {}, 100).catch(
      () => null,
    );
    expect(modelCapacityAvailable()).toBe(false);
    const used = getSettings().used;
    expect(reserveRequest("resume:busy", true, true)).toBeNull();
    expect(getSettings().used).toBe(used);
    release();
    await Promise.all([first, second]);
    expect(modelCapacityAvailable()).toBe(true);
  } finally {
    release();
    globalThis.fetch = originalFetch;
  }
});
