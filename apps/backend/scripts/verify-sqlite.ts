/**
 * Verifies the embedded SQLite backend from a completely new temporary file.
 * It never opens, imports, copies, or modifies an existing desktop profile.
 *
 *   node --import tsx scripts/verify-sqlite.ts
 *   SURFACE_SQLITE_VERIFY_DIR=/tmp/new-profile node --import tsx scripts/verify-sqlite.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(here, "..");
const migrationCount = (
  JSON.parse(
    readFileSync(
      join(backendDirectory, "drizzle-sqlite/meta/_journal.json"),
      "utf8",
    ),
  ) as { entries: unknown[] }
).entries.length;
const phase = process.env.SURFACE_SQLITE_VERIFY_PHASE ?? "main";
const root =
  process.env.SURFACE_SQLITE_VERIFY_DIR ??
  mkdtempSync(join(tmpdir(), "surface-sqlite-verification-"));
if (phase === "main" && existsSync(join(root, "surface.sqlite3"))) {
  throw new Error(`Refusing to reuse an existing SQLite profile at ${root}.`);
}
const databaseFile = join(root, "surface.sqlite3");
const dataDirectory = join(root, "data");
process.env.SQLITE_DATABASE_FILE = databaseFile;
process.env.DATA_DIR = dataDirectory;
process.env.SQLITE_MIGRATIONS_DIR = join(backendDirectory, "drizzle-sqlite");
process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";

if (phase === "reopen") {
  await reopenCheck();
} else {
  await mainCheck();
}

async function mainCheck(): Promise<void> {
  const checks: { name: string; result: string }[] = [];
  const check = (name: string, result: string) => {
    checks.push({ name, result });
    console.info(`ok ${name}: ${result}`);
  };

  const { runMigrations } =
    await import("../src/infrastructure/database/migrate.ts");
  const { closeDatabase, executeStatement, transaction } =
    await import("../src/infrastructure/database/client.ts");
  const { db } = await import("../src/infrastructure/database/client.ts");
  const { saveProfile, findProfile } =
    await import("../src/modules/profile/profile.repository.ts");
  const { getSettings, saveSettings } =
    await import("../src/modules/analysis/settings.ts");
  const { listJobs, findJobById, setJobStatus, upsertCandidates } =
    await import("../src/modules/jobs/jobs.repository.ts");
  const { persistSnapshot } =
    await import("../src/modules/collection/snapshots.ts");
  const { enqueueCollection, syncRuns } =
    await import("../src/modules/work/work.service.ts");
  const { executeCollection, recoverInterruptedWork } =
    await import("../src/modules/work/executor.ts");
  const { details, library, recoverResearch } =
    await import("../src/modules/research/research.service.ts");
  const { listOpportunities, companyDetail } =
    await import("../src/modules/company-discovery/repository.ts");
  const { workspaceRevision } =
    await import("../src/modules/work/events.routes.ts");
  const { companies, configuredSources } =
    await import("../src/modules/workspace/workspace.tables.ts");
  const { workItems, runItems, coordinationLocks, executorLease } =
    await import("../src/modules/work/work.tables.ts");
  const {
    companyActions,
    companyContacts,
    companyDiscoverySearches,
    companySearchMatches,
    companySignals,
  } = await import("../src/modules/company-discovery/tables.ts");
  const {
    researchEvents,
    researchMessages,
    researchReports,
    researchRuns,
    researchSources,
    companyLinkReviews,
  } = await import("../src/modules/research/research.tables.ts");
  const { jobs, jobSources } =
    await import("../src/modules/jobs/jobs.tables.ts");
  const { observations, jobVersions, snapshots } =
    await import("../src/modules/collection/collection.tables.ts");
  const { assessments, analysisSettings } =
    await import("../src/modules/analysis/analysis.tables.ts");
  const { eq } = await import("drizzle-orm");

  assert.equal(await runMigrations(), join(backendDirectory, "drizzle-sqlite"));
  const tableRows = await executeStatement<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       AND name <> '__surface_sqlite_migrations'
     ORDER BY name`,
  );
  assert.equal(tableRows.length, 34);
  assert.ok(tableRows.some(({ name }) => name === "applications"));
  check("fresh migration baseline", `${tableRows.length} application tables`);
  const migrationRows = await executeStatement<{ count: number }>(
    "SELECT CAST(count(*) AS INTEGER) AS count FROM __surface_sqlite_migrations",
  );
  assert.equal(migrationRows[0]?.count, migrationCount);
  check("migration history", `${migrationCount} SQLite migrations recorded`);
  let foreignKeyCount = 0;
  for (const { name } of tableRows) {
    assert.match(name, /^[a-z_][a-z0-9_]*$/i);
    foreignKeyCount += (
      await executeStatement(`PRAGMA foreign_key_list("${name}")`)
    ).length;
  }
  assert.ok(foreignKeyCount >= 30);
  check("constraints", `${foreignKeyCount} foreign keys`);

  const profile = await saveProfile({
    targetRoles: "Senior Software Engineer, TypeScript",
    preferredSkills: "TypeScript, React, SQLite",
    locationPreferences: "Remote, India",
    dealBreakers: "No unpaid trials",
    context: {
      experience: "Backend and desktop application development.",
      yearsExperience: 6,
      industries: "Developer tools",
      growthInterests: "Local-first software",
      workMode: "remote",
      constraints: {
        countries: ["India"],
        workMode: "remote",
        minimumSalary: 100000,
        currency: "INR",
        salaryPeriod: "year",
        employmentTypes: ["full-time"],
      },
      compensationExpectations: "",
      eligibilityNotes: "Authorized in India.",
      projects: [
        {
          title: "Surface",
          url: "https://example.com/surface",
          technologies: "TypeScript",
          contribution: "SQLite storage",
          results: "Local-first workspace",
        },
      ],
    },
  });
  assert.equal(profile.revision, 1);
  const readProfile = await findProfile();
  assert.equal(readProfile?.context.constraints.countries[0], "IN");
  assert.equal(readProfile?.context.projects[0]?.title, "Surface");
  check(
    "profile JSON",
    "nested context, arrays, numbers and strings round-trip",
  );

  const settings = await getSettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.paused, false);
  const paused = await saveSettings({ paused: true });
  assert.equal(paused.paused, true);
  assert.equal((await getSettings()).paused, true);
  await saveSettings({ paused: false });
  check("settings booleans", "analysis enabled and paused persisted as 0/1");

  const now = new Date().toISOString();
  const companyId = crypto.randomUUID();
  await db.insert(companies).values({
    id: companyId,
    name: "Acme Robotics",
    website: "https://acme.example",
    normalizedWebsite: "acme.example",
    description: "Builds warehouse robots.",
    reviewState: "will_apply",
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
  const sourceId = crypto.randomUUID();
  await db.insert(configuredSources).values({
    id: sourceId,
    companyId,
    label: "Acme careers",
    url: "https://acme.example/careers",
    endpoint: "https://acme.example/careers",
    provider: "public-page",
    boardIdentity: null,
    support: "unverified",
    reason: "SQLite verification fixture",
    paused: false,
    scheduleHours: 12,
    createdAt: now,
    updatedAt: now,
  });
  check("workspace CRUD", "company and configured source inserted");

  const snapshotPayload = await persistSnapshot({
    url: "https://acme.example/jobs/1",
    body: "<html><body>Senior TypeScript Engineer</body></html>",
    rawBytes: new TextEncoder().encode(
      "<html><body>Senior TypeScript Engineer</body></html>",
    ),
    mediaType: "text/html",
    statusCode: 200,
  });
  const snapshotFile = join(
    dataDirectory,
    "snapshots",
    (
      await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, snapshotPayload.snapshotId))
        .limit(1)
    )[0]!.hash,
  );
  assert.equal(existsSync(snapshotFile), true);
  check("snapshot persistence", snapshotFile);

  const candidate = {
    source: "public-page",
    configuredSourceId: sourceId,
    companyId,
    externalId: "job-1",
    title: "Senior TypeScript Engineer",
    company: "Acme Robotics",
    location: "Remote, India",
    isRemote: true,
    employmentType: "full-time",
    description:
      "Build local-first desktop software with TypeScript, React and SQLite. ".repeat(
        4,
      ),
    descriptionHtml:
      "<p>Build local-first desktop software with TypeScript.</p>",
    applyUrl: "https://acme.example/jobs/1",
    sourceUrl: "https://acme.example/jobs/1",
    postedAt: "2026-11-01",
    tags: ["typescript", "sqlite"],
    workMode: "remote",
    countries: ["India"],
    compensation: {
      currency: "INR",
      min: 2000000,
      max: 3000000,
      period: "year",
      original: "INR 20-30L per year",
    },
    evidence: [
      {
        field: "title",
        value: "Senior TypeScript Engineer",
        reference: "https://acme.example/jobs/1",
      },
    ],
    method: "verification",
    incomplete: false,
    snapshotId: snapshotPayload.snapshotId,
    resourceId: snapshotPayload.resourceId,
  } satisfies import("../src/shared/normalization/job-normalization.ts").JobCandidate;
  const upsert = await upsertCandidates([candidate]);
  assert.equal(upsert.insertedCount, 1);
  const listed = await listJobs({
    page: 1,
    limit: 10,
    status: "inbox",
    relevance: "all",
    sort: "newest",
    search: "typescript",
  });
  assert.equal(listed.total, 1);
  const pendingMatches = await listJobs({
    page: 1,
    limit: 10,
    status: "inbox",
    relevance: "all",
    sort: "best-fit",
    search: "",
    view: "review",
  });
  assert.equal(pendingMatches.jobs[0]?.id, listed.jobs[0]?.id);
  assert.equal(listed.jobs[0]?.company, "Acme Robotics");
  assert.deepEqual(listed.jobs[0]?.countries, ["India"]);
  assert.equal(listed.jobs[0]?.compensation?.min, 2000000);
  const detail = await findJobById(listed.jobs[0]!.id);
  assert.equal(detail?.observations[0]?.rawAvailable, true);
  await setJobStatus(listed.jobs[0]!.id, "saved");
  assert.equal((await findJobById(listed.jobs[0]!.id))?.status, "saved");
  check(
    "jobs, JSON and search",
    "insert/update/detail, case-insensitive search, JSON columns",
  );

  const enqueued = await enqueueCollection([sourceId], "Verification refresh");
  assert.ok(enqueued.runId);
  assert.equal(
    (await enqueueCollection([sourceId], "Verification refresh")).runId,
    enqueued.runId,
  );
  const runItem = (
    await db
      .select()
      .from(runItems)
      .where(eq(runItems.runId, enqueued.runId))
      .limit(1)
  )[0]!;
  const workRow = (
    await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, runItem.workId))
      .limit(1)
  )[0];
  assert.equal(workRow?.state, "queued");
  await db
    .update(workItems)
    .set({ state: "running", startedAt: now, attempts: 1 })
    .where(eq(workItems.id, runItem.workId));
  await recoverInterruptedWork();
  assert.equal(
    (
      await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, runItem.workId))
        .limit(1)
    )[0]?.state,
    "queued",
  );
  await syncRuns();
  check(
    "monitoring queue and recovery",
    "collection enqueued, run linked, interrupted work recovered",
  );
  const failedSourceId = crypto.randomUUID();
  await db.insert(configuredSources).values({
    id: failedSourceId,
    label: "Fixture failed portal",
    url: "https://example.test/failed",
    endpoint: "https://example.test/failed",
    provider: "public-page",
    support: "supported",
    reason: "Fixture",
    scheduleHours: 0,
    createdAt: now,
    updatedAt: now,
  });
  const refresh = await enqueueCollection(
    [sourceId, failedSourceId],
    "Partial refresh fixture",
  );
  const { getRun } = await import("../src/modules/work/work.service.ts");
  const refreshRun = await getRun(refresh.runId);
  const [healthy, failed] = [sourceId, failedSourceId].map((id) =>
    refreshRun.items.find((item) => item.sourceId === id)!,
  );
  await db
    .update(workItems)
    .set({ attempts: 2 })
    .where(eq(workItems.id, failed!.id));
  await Promise.all([
    executeCollection(healthy!, async () => ({
      candidates: [candidate],
      complete: true,
      error: null,
    })),
    executeCollection(failed!, async () => {
      throw new Error("Fixture portal unavailable");
    }),
  ]);
  const outcomes = await getRun(refresh.runId);
  assert.equal(outcomes.state, "partial");
  assert.equal(
    outcomes.items.find(({ id }) => id === healthy!.id)?.result?.insertedCount,
    0,
  );
  assert.equal((await findJobById(listed.jobs[0]!.id))?.availability, "open");
  check(
    "partial refresh",
    "healthy source preserved its listing and repeated collection created no duplicate",
  );
  await db.insert(executorLease).values({
    id: "backend",
    owner: "verification",
    expiresAt: Date.now() + 30_000,
  });
  await db.insert(coordinationLocks).values({ name: "verify-lock" });
  assert.equal(
    (
      await db
        .select()
        .from(executorLease)
        .where(eq(executorLease.id, "backend"))
    )[0]?.owner,
    "verification",
  );
  check("coordination rows", "lease and lock stored");

  let constraintChecks = 0;
  const jobRow = (
    await db.select().from(jobs).where(eq(jobs.id, listed.jobs[0]!.id)).limit(1)
  )[0]!;
  await assert.rejects(
    db.insert(jobs).values({
      id: crypto.randomUUID(),
      dedupeKey: jobRow.dedupeKey,
      canonicalUrl: "https://acme.example/jobs/duplicate",
      title: "Duplicate",
      company: "Acme Robotics",
      applyUrl: "https://acme.example/jobs/duplicate",
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  );
  constraintChecks++;
  await assert.rejects(
    db.insert(jobSources).values({
      id: crypto.randomUUID(),
      jobId: "missing-job",
      source: "public-page",
      sourceRecordKey: "missing",
      sourceUrl: "https://acme.example/missing",
      firstSeenAt: now,
      lastSeenAt: now,
    }),
  );
  constraintChecks++;
  await db.insert(workItems).values({
    id: crypto.randomUUID(),
    kind: "collection",
    identity: "seed-active",
    state: "queued",
    retryAt: now,
    createdAt: now,
  });
  await assert.rejects(
    db.insert(workItems).values({
      id: crypto.randomUUID(),
      kind: "collection",
      identity: "seed-active",
      state: "running",
      retryAt: now,
      createdAt: now,
    }),
  );
  await db.insert(workItems).values({
    id: crypto.randomUUID(),
    kind: "collection",
    identity: "seed-active",
    state: "completed",
    retryAt: now,
    createdAt: now,
    completedAt: now,
  });
  constraintChecks++;
  check("constraints", `${constraintChecks} unique/foreign-key rejections`);

  const rolledBackId = crypto.randomUUID();
  await assert.rejects(
    transaction(async (tx) => {
      await tx.insert(companies).values({
        id: rolledBackId,
        name: "Rollback Co",
        createdAt: now,
        updatedAt: now,
      });
      throw new Error("rollback check");
    }),
    /rollback check/,
  );
  assert.equal(
    (await db.select().from(companies).where(eq(companies.id, rolledBackId)))
      .length,
    0,
  );
  check("transactions", "BEGIN IMMEDIATE commit and rollback verified");

  const searchId = crypto.randomUUID();
  const signalId = crypto.randomUUID();
  await db.insert(companyDiscoverySearches).values({
    id: searchId,
    name: "Robotics funding",
    source: "funding",
    rule: {
      name: "Robotics funding",
      source: "funding",
      keywords: ["robotics"],
      locations: [],
      fundingSources: ["techcrunch"],
      schedule: "manual",
      paused: false,
    } as never,
    revision: 1,
    archived: false,
    paused: false,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(companySignals).values({
    id: signalId,
    companyId,
    identity: "funding:acme",
    kind: "funding",
    provider: "techcrunch",
    providerId: "acme-series-a",
    amount: "10M",
    currency: "USD",
    stage: "Series A",
    evidence: [],
    firstDiscoveredAt: now,
    lastSeenAt: now,
  });
  await db.insert(companySearchMatches).values({
    id: crypto.randomUUID(),
    searchId,
    companyId,
    signalId,
    firstDiscoveredAt: now,
    lastSeenAt: now,
    revision: 1,
  });
  const contactId = crypto.randomUUID();
  await db.insert(companyContacts).values({
    id: contactId,
    companyId,
    identity: "hiring@acme.example",
    name: "Acme Hiring",
    role: "Talent",
    kind: "hiring_inbox",
    methods: [
      {
        kind: "email",
        value: "hiring@acme.example",
        sourceUrl: "https://acme.example/careers",
        status: "published",
        checkedAt: now,
        provider: null,
        verifiedAt: null,
      },
    ],
    evidence: [],
    manual: false,
    checkedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(companyActions).values({
    id: crypto.randomUUID(),
    companyId,
    kind: "will_apply",
    contactId,
    jobId: listed.jobs[0]!.id,
    note: "Verification action",
    requestId: crypto.randomUUID(),
    createdAt: now,
  });
  const enrichmentWorkId = crypto.randomUUID();
  await db.insert(workItems).values({
    id: enrichmentWorkId,
    kind: "company-enrichment",
    identity: `company-enrichment:${companyId}`,
    payload: { companyId },
    state: "queued",
    retryAt: now,
    createdAt: now,
  });
  const opportunities = await listOpportunities({
    page: 1,
    pageSize: 10,
    q: "acme",
    archived: false,
  });
  assert.equal(opportunities.total, 1);
  assert.equal(opportunities.counts.will_apply, 1);
  const company = await companyDetail(companyId);
  assert.equal(company.enrichmentPending, true);
  assert.equal(company.contacts.length, 1);
  check(
    "company discovery queries",
    "search, queue counts, contacts, actions and JSON payload lookup",
  );

  const researchRunId = crypto.randomUUID();
  await db.insert(researchRuns).values({
    id: researchRunId,
    companyId,
    kind: "report",
    state: "running",
    draft: "",
    createdAt: now,
  });
  await db.insert(researchSources).values({
    id: crypto.randomUUID(),
    companyId,
    runId: researchRunId,
    url: "https://acme.example/about",
    title: "About Acme",
    kind: "page",
    text: "Acme builds warehouse robots.",
    links: [],
    status: "200",
    retrievedAt: now,
  });
  const events = await db
    .insert(researchEvents)
    .values([
      {
        runId: researchRunId,
        type: "progress",
        text: "Started",
        createdAt: now,
      },
      {
        runId: researchRunId,
        type: "text",
        text: "Reading sources",
        createdAt: now,
      },
    ])
    .returning();
  assert.ok(events[1]!.id > events[0]!.id);
  await db.insert(researchReports).values({
    id: crypto.randomUUID(),
    companyId,
    runId: researchRunId,
    markdown: "# Acme",
    sourceIds: [],
    model: "verification",
    createdAt: now,
  });
  await db.insert(researchMessages).values({
    id: crypto.randomUUID(),
    companyId,
    runId: researchRunId,
    question: "What does Acme build?",
    answer: "Warehouse robots.",
    webSearch: false,
    sourceIds: [],
    createdAt: now,
  });
  await db.insert(companyLinkReviews).values({
    companyId,
    runId: researchRunId,
    links: [],
    checkedAt: now,
  });
  const research = await details(companyId);
  assert.equal(research.reports.length, 1);
  assert.equal(research.messages[0]?.webSearch, false);
  assert.equal(research.sources.length, 1);
  await recoverResearch();
  const interrupted = await details(companyId);
  assert.equal(interrupted.runs[0]?.state, "interrupted");
  assert.ok(interrupted.runs[0]?.completedAt);
  assert.equal((await library()).length, 1);
  check(
    "research lifecycle",
    "run, sources, serial events, report, boolean message and recovery",
  );

  const revision = await workspaceRevision();
  assert.match(revision, /versions/);
  check("workspace revision", revision);

  const assessmentId = crypto.randomUUID();
  await db.insert(assessments).values({
    id: assessmentId,
    jobId: listed.jobs[0]!.id,
    jobVersionId: (
      await db
        .select()
        .from(jobVersions)
        .where(eq(jobVersions.jobId, listed.jobs[0]!.id))
        .limit(1)
    )[0]!.id,
    profileRevision: 1,
    formatVersion: 2,
    output: {
      score: 80,
      summary: "Good fit",
      skillsFit: [
        {
          text: "TypeScript experience matches the role.",
          kind: "fact",
          jobEvidence: null,
          profileEvidence: null,
        },
      ],
      growthPotential: [],
      strengths: [
        {
          text: "Relevant desktop and backend work.",
          kind: "interpretation",
          jobEvidence: null,
          profileEvidence: null,
        },
      ],
      concerns: [],
      unansweredQuestions: [],
      projectEvidence: [],
    },
    model: "verification",
    createdAt: now,
  });
  assert.equal(
    (
      await db
        .select()
        .from(assessments)
        .where(eq(assessments.id, assessmentId))
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(analysisSettings)
        .where(eq(analysisSettings.id, "me"))
    ).length,
    1,
  );
  assert.ok(
    (
      await db
        .select()
        .from(observations)
        .where(eq(observations.jobId, listed.jobs[0]!.id))
    ).length > 0,
  );
  check("assessment/observation rows", "foreign-key linked rows inserted");

  await setJobStatus(listed.jobs[0]!.id, "inbox");
  const ranked = await listJobs({
    page: 1,
    limit: 10,
    status: "inbox",
    relevance: "all",
    sort: "best-fit",
    search: "",
    view: "matches",
  });
  assert.equal(ranked.jobs[0]?.id, listed.jobs[0]?.id);
  check(
    "match views",
    "unassessed role appears in Needs review and moves to Best matches after a supported assessment",
  );
  await db
    .update(researchRuns)
    .set({ state: "completed", completedAt: now })
    .where(eq(researchRuns.id, researchRunId));
  await db
    .update(workItems)
    .set({ state: "completed", completedAt: now })
    .where(eq(workItems.id, enrichmentWorkId));
  await closeDatabase();

  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", fileURLToPath(import.meta.url)],
    {
      env: {
        ...process.env,
        SURFACE_SQLITE_VERIFY_PHASE: "reopen",
        SURFACE_SQLITE_VERIFY_DIR: root,
      },
      encoding: "utf8",
    },
  );
  if (child.status !== 0) {
    throw new Error(
      `Reopen check failed (${child.status}): ${child.stderr || child.stdout}`,
    );
  }
  const reopenLine = child.stdout
    .split("\n")
    .find((line) => line.startsWith("REOPEN_JSON "));
  assert.ok(reopenLine, `Reopen report missing: ${child.stdout}`);
  const reopened = JSON.parse(
    reopenLine.slice("REOPEN_JSON ".length),
  ) as Record<string, unknown>;
  assert.equal(reopened.jobs, 1);
  assert.equal(reopened.profileRevision, 1);
  assert.equal(reopened.researchRuns, 1);
  assert.equal(reopened.migrations, migrationCount);
  check("restart persistence", JSON.stringify(reopened));

  const integrity = await reopenIntegrity(databaseFile);
  assert.equal(integrity, "ok");
  check("integrity", "PRAGMA integrity_check and foreign_key_check passed");

  const report = {
    format: "surface-sqlite-verification",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    profile: root,
    databaseFile,
    dataDirectory,
    checks,
    reopen: reopened,
    integrity,
  };
  writeFileSync(
    join(root, "verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.info(
    `SQLite verification report: ${join(root, "verification.json")}`,
  );
}

async function reopenCheck(): Promise<void> {
  const { runMigrations } =
    await import("../src/infrastructure/database/migrate.ts");
  const { closeDatabase, executeStatement } =
    await import("../src/infrastructure/database/client.ts");
  const { listJobs } = await import("../src/modules/jobs/jobs.repository.ts");
  const { findProfile } =
    await import("../src/modules/profile/profile.repository.ts");
  await runMigrations();
  const scalar = async (sql: string) => {
    const rows = await executeStatement<{ value: number }>(sql);
    return Number(rows[0]?.value ?? 0);
  };
  const listed = await listJobs({
    page: 1,
    limit: 10,
    status: "inbox",
    relevance: "all",
    sort: "newest",
    search: "typescript",
  });
  const reopen = {
    jobs: listed.total,
    profileRevision: (await findProfile())?.revision ?? 0,
    researchRuns: await scalar(
      "SELECT CAST(count(*) AS INTEGER) AS value FROM research_runs",
    ),
    workItems: await scalar(
      "SELECT CAST(count(*) AS INTEGER) AS value FROM work_items",
    ),
    migrations: await scalar(
      "SELECT CAST(count(*) AS INTEGER) AS value FROM __surface_sqlite_migrations",
    ),
  };
  await closeDatabase();
  console.log(`REOPEN_JSON ${JSON.stringify(reopen)}`);
}

async function reopenIntegrity(file: string): Promise<string> {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(file);
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get() as {
      integrity_check?: string;
    };
    const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeys.length) {
      throw new Error("Foreign-key check failed after reopen.");
    }
    return integrity.integrity_check ?? "unknown";
  } finally {
    database.close();
  }
}
