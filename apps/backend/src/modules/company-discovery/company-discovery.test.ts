import { beforeAll, describe, expect, test } from "bun:test";
import { eq, and } from "drizzle-orm";
import {
  companySearchInputSchema,
  companyContactInputSchema,
  contactMethodSchema,
} from "@surface/contracts";
import { runMigrations } from "../../infrastructure/database/migrate";
import { db, rawQuery } from "../../infrastructure/database/client";
import { companies } from "../workspace/workspace.tables";
import {
  researchRuns,
  researchReports,
  researchSources,
  researchMessages,
} from "../research/research.tables";
import { workItems } from "../work/work.tables";
import {
  companySignals,
  companyContacts,
  companyDiscoverySearches,
  companySearchMatches,
} from "./tables";
import {
  persistCandidate,
  recordAction,
  getCompany,
  companyDetail,
  listOpportunities,
} from "./repository";
import { contactsFromPage, saveContact } from "./contacts";
import { nextDailyRun, queueFor, canonicalUrl } from "./identity";
import { crawlOutput } from "../research/tools";
import {
  parseCompanyPage,
  matchesRule,
  type CompanyCandidate,
  type DiscoveryPage,
} from "./sources";
import {
  enqueueIntake,
  enqueueCompanySearch,
  executeCompanyWork,
  parseIntakeCsv,
  retryCompanyRun,
} from "./service";
import { enrichCompany, cacheLogo } from "./enrichment";
const fixture = async (name: string) =>
  crawlOutput.parse(
    await Bun.file(new URL(`fixtures/${name}.json`, import.meta.url)).json(),
  );
const now = () => new Date().toISOString();
function page(domain = `company-${crypto.randomUUID()}.com`): DiscoveryPage {
  return crawlOutput.parse({
    url: `https://${domain}/`,
    title: "Identical Name",
    text: "Company website content",
    links: [],
    metadata: {
      siteName: "Identical Name",
      description: "Builds useful software",
    },
    status: "ok",
    retrievedAt: now(),
  });
}
function candidate(p = page()): CompanyCandidate {
  return parseCompanyPage(p)!;
}
beforeAll(async () => {
  if (process.env.SQLITE_DATABASE_FILE !== ":memory:")
    throw new Error("Run this suite with an isolated in-memory database.");
  await runMigrations();
});
describe("company discovery evidence and rules", () => {
  test("legacy company reports stay in Companies without a discovery signal; summaries do not count as reports", async () => {
    const companyId = crypto.randomUUID(),
      summaryCompanyId = crypto.randomUUID(),
      reportRun = crypto.randomUUID(),
      questionRun = crypto.randomUUID(),
      summaryRun = crypto.randomUUID(),
      sourceId = crypto.randomUUID(),
      label = `Research preservation ${crypto.randomUUID()}`,
      date = now();
    await db.insert(companies).values([
      {
        id: companyId,
        name: label,
        website: "https://legacy-research.example",
        notes: "Keep my notes",
        watchReason: "Existing shortlist",
        reviewState: "will_apply",
        createdAt: date,
        updatedAt: date,
      },
      {
        id: summaryCompanyId,
        name: label + " summary",
        website: "https://summary-only.example",
        createdAt: date,
        updatedAt: date,
      },
    ]);
    await db.insert(researchRuns).values([
      {
        id: reportRun,
        companyId,
        kind: "report",
        state: "completed",
        createdAt: date,
        completedAt: date,
      },
      {
        id: questionRun,
        companyId,
        kind: "question",
        state: "completed",
        createdAt: date,
        completedAt: date,
      },
      {
        id: summaryRun,
        companyId: summaryCompanyId,
        kind: "summary",
        state: "completed",
        createdAt: date,
        completedAt: date,
      },
    ]);
    await db.insert(researchSources).values({
      id: sourceId,
      companyId,
      runId: reportRun,
      url: "https://legacy-research.example",
      title: "Official evidence",
      kind: "page",
      text: "Saved company evidence",
      links: [],
      status: "ok",
      retrievedAt: date,
    });
    await db.insert(researchReports).values({
      id: crypto.randomUUID(),
      companyId,
      runId: reportRun,
      markdown: "Original cited report",
      sourceIds: [sourceId],
      model: "original-model",
      createdAt: date,
    });
    await db.insert(researchMessages).values([
      {
        id: crypto.randomUUID(),
        companyId,
        runId: questionRun,
        question: "Original question",
        answer: "Original answer",
        sourceIds: [sourceId],
        webSearch: false,
        createdAt: date,
      },
      {
        id: crypto.randomUUID(),
        companyId: summaryCompanyId,
        runId: summaryRun,
        question: "Company summary",
        answer: "Only a summary",
        sourceIds: [],
        webSearch: true,
        createdAt: date,
      },
    ]);
    const { details } = await import("../research/research.service");
    const before = await details(companyId);
    const matching = await listOpportunities({
      page: 1,
      pageSize: 1,
      q: label,
      queue: "all",
      hasResearch: true,
    });
    expect(matching.total).toBe(1);
    expect(matching.items[0]!.id).toBe(companyId);
    expect(matching.items[0]!.signals).toHaveLength(0);
    expect(matching.items[0]!.research).toEqual({
      reportCount: 1,
      latestReportAt: date,
      state: "saved",
    });
    expect(matching.counts.all).toBe(1);
    expect(matching.counts.will_apply).toBe(1);
    const withoutReport = await listOpportunities({
      page: 1,
      pageSize: 30,
      q: label,
      hasResearch: false,
    });
    expect(withoutReport.items.map((c) => c.id)).toEqual([summaryCompanyId]);
    expect(withoutReport.items[0]!.research.state).toBe("none");
    expect((await companyDetail(companyId)).notes).toBe("Keep my notes");
    expect(await details(companyId)).toEqual(before);
    const activeId = crypto.randomUUID();
    await db.insert(researchRuns).values({
      id: activeId,
      companyId,
      kind: "report",
      state: "running",
      createdAt: new Date(Date.parse(date) + 1000).toISOString(),
    });
    expect((await companyDetail(companyId)).research.state).toBe("running");
    await db
      .update(researchRuns)
      .set({
        state: "failed",
        completedAt: now(),
        error: "Provider unavailable",
      })
      .where(eq(researchRuns.id, activeId));
    expect((await companyDetail(companyId)).research).toEqual({
      reportCount: 1,
      latestReportAt: date,
      state: "saved",
    });
    expect((await details(companyId)).reports).toEqual(before.reports);
    expect((await details(companyId)).messages).toEqual(before.messages);
    expect((await details(companyId)).sources).toEqual(before.sources);
  });
  test("live YC fixture establishes stable identity and founders without inventing an email or date", async () => {
    const p = await fixture("yc-posthog"),
      c = parseCompanyPage(p, "yc")!;
    expect(c.providerId).toBe("13312");
    expect(c.batch).toBe("Winter 2020");
    expect(c.publicationDate).toBeNull();
    const contacts = contactsFromPage(p);
    expect(contacts.some((person) => person.name === "James Hawkins")).toBe(
      true,
    );
    expect(
      contacts
        .flatMap((person) => person.methods)
        .some((m) => m.kind === "email"),
    ).toBe(false);
  });
  test("funding parser retains publication separately and extracts current round rather than valuation", async () => {
    const c = parseCompanyPage(await fixture("funding-profound"), "funding")!;
    expect(c.name).toBe("Profound");
    expect(c.amount).toBe("180000000");
    expect(c.currency).toBe("USD");
    expect(c.stage).toBe("series-d");
    expect(c.publicationDate).toBe("2026-09-15");
    expect(c.announcementDate).toBeNull();
    const rule = companySearchInputSchema.parse({
      name: "Funding",
      source: "funding",
      recencyDays: 30,
    });
    expect(matchesRule(c, rule, new Date("2026-10-24"))).toBe(false);
    expect(matchesRule({ ...c, publicationDate: null }, rule)).toBe(false);
  });
  test("daily schedule uses the selected timezone and DST", () => {
    expect(
      nextDailyRun("09:00", "Asia/Kolkata", new Date("2026-10-24T00:00:00Z")),
    ).toBe("2026-10-24T03:30:00.000Z");
    expect(
      nextDailyRun(
        "09:00",
        "America/New_York",
        new Date("2026-11-01T00:00:00Z"),
      ),
    ).toBe("2026-11-01T14:00:00.000Z");
  });
  test("CSV handles quoted names and multiple URL columns; canonical URL strips all tracking keys", () => {
    expect(
      parseIntakeCsv(
        'name,website,announcement_url\n"Acme, Inc",https://acme.com,https://news.com/a',
      ),
    ).toEqual(["https://acme.com", "https://news.com/a"]);
    expect(() => parseIntakeCsv("name\nAcme")).toThrow();
    expect(
      canonicalUrl("https://a.com/?utm_source=a&utm_medium=b&x=1#anchor"),
    ).toBe("https://a.com/?x=1");
  });
  test("generic inboxes never become founder email and published never implies verified", () => {
    const p = page();
    p.metadata.people = [{ name: "Ada Founder", role: "CEO", profiles: [] }];
    p.metadata.emails = [
      {
        email: "careers@company.com",
        name: "Ada Founder",
        context: "Contact Ada",
      },
    ];
    const contacts = contactsFromPage(p);
    expect(
      contacts.find((c) => c.name === "Ada Founder")!.methods,
    ).toHaveLength(0);
    expect(
      contacts.find((c) => c.kind === "hiring_inbox")!.methods[0]!.status,
    ).toBe("published");
    expect(
      contactMethodSchema.safeParse({
        kind: "email",
        value: "ada@company.com",
        sourceUrl: p.url,
        status: "mailbox_verified",
        checkedAt: now(),
      }).success,
    ).toBe(false);
    expect(
      companyContactInputSchema.safeParse({
        name: "Ada",
        role: "CEO",
        kind: "person",
        methods: [
          {
            kind: "email",
            value: "careers@company.com",
            sourceUrl: p.url,
            checkedAt: now(),
          },
        ],
      }).success,
    ).toBe(false);
  });
});
describe("persistent company workflow", () => {
  test("repeat and concurrent discoveries reuse one company, preserve user data, and keep same-name domains distinct", async () => {
    const c = candidate(),
      results = await Promise.all([persistCandidate(c), persistCandidate(c)]);
    expect(results[0]!.company.id).toBe(results[1]!.company.id);
    const id = results[0]!.company.id;
    const defer = new Date(Date.now() + 86400000).toISOString();
    await db
      .update(companies)
      .set({
        notes: "Personal note",
        reviewState: "will_apply",
        deferredUntil: defer,
      })
      .where(eq(companies.id, id));
    await persistCandidate({
      ...c,
      description: "Changed scraped description",
    });
    const saved = await getCompany(id);
    expect(saved.notes).toBe("Personal note");
    expect(saved.reviewState).toBe("will_apply");
    expect(saved.deferredUntil).toBe(defer);
    expect(
      (
        await db
          .select()
          .from(companySignals)
          .where(eq(companySignals.companyId, id))
      ).length,
    ).toBe(1);
    const other = await persistCandidate(candidate());
    expect(other.company.id).not.toBe(id);
    expect(other.company.name).toBe(saved.name);
  });
  test("one funding event has multiple references but a later round is separate", async () => {
    const c = {
      ...candidate(),
      kind: "funding" as const,
      provider: "news",
      amount: "5000000",
      currency: "USD",
      stage: "seed",
      publicationDate: "2026-10-22",
    };
    const a = await persistCandidate(c);
    const p = { ...c.page, url: "https://other-news.com/round" };
    const b = await persistCandidate({
      ...c,
      page: p,
      evidence: [
        {
          url: p.url,
          title: "Other source",
          excerpt: "Same round",
          retrievedAt: now(),
        },
      ],
      publicationDate: "2026-10-24",
    });
    expect(a.signal.id).toBe(b.signal.id);
    expect(b.signal.evidence).toHaveLength(2);
    const later = await persistCandidate({
      ...c,
      page: { ...p, url: "https://other-news.com/later" },
      evidence: [
        {
          url: "https://other-news.com/later",
          title: "Later round",
          excerpt: "New round",
          retrievedAt: now(),
        },
      ],
      publicationDate: "2027-01-24",
    });
    expect(later.signal.id).not.toBe(a.signal.id);
  });
  test("conflicting provider identity requires confirmation instead of merging domains", async () => {
    const c = {
      ...candidate(),
      kind: "yc" as const,
      provider: "yc",
      providerId: crypto.randomUUID(),
      batch: "Fall 2026",
    };
    await persistCandidate(c);
    await expect(
      persistCandidate({ ...c, website: "https://different-company.com" }),
    ).rejects.toThrow("Ambiguous");
  });
  test("Applied and Contacted are distinct idempotent actions; a reminder returns to its previous queue", async () => {
    const { company } = await persistCandidate(candidate()),
      id = company.id;
    const input = (kind: "applied" | "contacted" | "deferred") => ({
      kind,
      requestId: crypto.randomUUID(),
      contactId: null,
      jobId: null,
      note: "",
      deferredUntil: null,
    });
    const applied = input("applied");
    await recordAction(id, applied);
    await recordAction(id, applied);
    await recordAction(id, input("contacted"));
    const detail = await companyDetail(id);
    expect(detail.actions.map((a) => a.kind).toSorted()).toEqual([
      "applied",
      "contacted",
    ]);
    expect(detail.reviewState).toBe("done");
    const future = new Date(Date.now() + 86400000).toISOString();
    await recordAction(id, { ...input("deferred"), deferredUntil: future });
    const saved = await getCompany(id);
    expect(saved.reviewState).toBe("done");
    expect(queueFor(saved)).toBe("later");
    expect(queueFor(saved, new Date(Date.now() + 2 * 86400000))).toBe("done");
  });
  test("manual corrections survive later enrichment, and failed logos/contacts retain existing facts", async () => {
    const p = page(),
      { company } = await persistCandidate(candidate(p));
    const source = {
      url: p.url,
      title: "Team",
      excerpt: "Founder",
      retrievedAt: now(),
    };
    const contact = {
      name: "Ada Lovelace",
      role: "Founder",
      kind: "person",
      methods: [
        {
          kind: "email",
          value: "ada@company.com",
          sourceUrl: p.url,
          status: "manual",
          checkedAt: now(),
          provider: null,
          verifiedAt: null,
        },
      ],
      evidence: [source],
    };
    const corrected = await saveContact(company.id, contact, true);
    await saveContact(company.id, { ...contact, role: "CTO", methods: [] });
    expect(
      (
        await db
          .select()
          .from(companyContacts)
          .where(eq(companyContacts.id, corrected.id))
      )[0]!.role,
    ).toBe("Founder");
    await db
      .update(companies)
      .set({
        logoPath: "/api/company-discovery/logos/previous.png",
        notes: "keep",
      })
      .where(eq(companies.id, company.id));
    await enrichCompany(
      company.id,
      "full",
      undefined,
      async () => {
        throw new Error("offline");
      },
      async () => {
        throw new Error("broken logo");
      },
    );
    const saved = await getCompany(company.id);
    expect(saved.logoPath).toBe("/api/company-discovery/logos/previous.png");
    expect(saved.notes).toBe("keep");
    expect(saved.enrichmentError).toContain("offline");
    expect((await companyDetail(company.id)).contacts).toHaveLength(1);
  });
  test("search revision is captured at enqueue and pausing prevents new runs; saved job searches stay separate", async () => {
    const id = crypto.randomUUID(),
      rule = companySearchInputSchema.parse({
        name: "YC test",
        source: "yc",
        batches: ["Fall 2026"],
      });
    await db.insert(companyDiscoverySearches).values({
      id,
      name: rule.name,
      source: rule.source,
      rule,
      revision: 1,
      createdAt: now(),
      updatedAt: now(),
    });
    const a = await enqueueCompanySearch(id);
    const b = await enqueueCompanySearch(id);
    expect(a!.workId).toBe(b!.workId);
    await db
      .update(companyDiscoverySearches)
      .set({
        revision: 2,
        rule: { ...rule, batches: ["Summer 2026"] },
        paused: true,
      })
      .where(eq(companyDiscoverySearches.id, id));
    const [item] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, a!.workId));
    expect(item!.payload!.revision).toBe(1);
    expect((item!.payload!.rule as typeof rule).batches).toEqual(["Fall 2026"]);
    await expect(enqueueCompanySearch(id)).rejects.toThrow("Resume");
    await executeCompanyWork(item!);
    expect(
      (await db.select().from(workItems).where(eq(workItems.id, item!.id)))[0]!
        .state,
    ).toBe("interrupted");
  });
  test("partial intake keeps successful companies, retries only failed pages, and records Activity counts", async () => {
    const p = page(),
      broken = `https://failed-${crypto.randomUUID()}.com/`;
    const submission = await enqueueIntake([p.url, broken]);
    let [item] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, submission.workId));
    const read = async (url: string) => {
      if (url === broken) throw new Error("unavailable");
      return p;
    };
    const deps = {
      read,
      discover: async () => ({ urls: [], errors: [] }),
      enrich: async () => ({ contacts: 0, pages: 0, errors: [] }),
    };
    await executeCompanyWork(item!, deps);
    [item] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, submission.workId));
    expect(item!.state).toBe("partial");
    expect(item!.result!.new).toBe(1);
    expect(item!.result!.failed).toBe(1);
    const result = await retryCompanyRun([item!], "Test partial");
    const retried = await rawQuery<{ id: string }[]>`
      SELECT w.* FROM work_items w JOIN run_items r ON r.work_id=w.id WHERE r.run_id=${result.runId}`;
    expect(retried).toHaveLength(1);
    const [retry] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, String(retried[0]!.id)));
    let successfulReads = 0;
    await executeCompanyWork(retry!, {
      ...deps,
      read: async (url) => {
        if (url === p.url) successfulReads++;
        return { ...p, url };
      },
    });
    expect(successfulReads).toBe(0);
    expect(
      (
        await listOpportunities({
          page: 1,
          pageSize: 100,
          q: p.metadata.siteName,
        })
      ).total,
    ).toBeGreaterThan(0);
  });
  test("search membership survives changes to rules", async () => {
    const rule = companySearchInputSchema.parse({
        name: "Membership",
        source: "funding",
      }),
      id = crypto.randomUUID();
    await db.insert(companyDiscoverySearches).values({
      id,
      name: rule.name,
      source: rule.source,
      rule,
      createdAt: now(),
      updatedAt: now(),
    });
    const { company } = await persistCandidate(candidate(), {
      id,
      revision: 1,
    });
    await db
      .update(companyDiscoverySearches)
      .set({ rule: { ...rule, keywords: ["unrelated"] }, revision: 2 })
      .where(eq(companyDiscoverySearches.id, id));
    expect(
      await db
        .select()
        .from(companySearchMatches)
        .where(
          and(
            eq(companySearchMatches.searchId, id),
            eq(companySearchMatches.companyId, company.id),
          ),
        ),
    ).toHaveLength(1);
  });
  test("logo cache rejects HTML and stores safe SVG locally", async () => {
    await expect(
      cacheLogo("https://company.com/logo", async (url) => ({
        url,
        body: "<html>blocked</html>",
        mediaType: "text/html",
        statusCode: 200,
      })),
    ).rejects.toThrow("supported image");
    const path = await cacheLogo(
      "https://company.com/logo.svg",
      async (url) => ({
        url,
        body: '<svg viewBox="0 0 20 20"><script>alert(1)</script><path d="M0 0h20v20H0z"/></svg>',
        mediaType: "image/svg+xml",
        statusCode: 200,
      }),
    );
    expect(path).toMatch(
      /^\/api\/company-discovery\/logos\/[a-f0-9]{64}\.svg$/,
    );
  });
});

describe("source failures, recovery, and APIs", () => {
  test("official YC directory fixture validates public profile locators", async () => {
    const { ycDirectoryResponseSchema } = await import("./sources/yc");
    const raw = await Bun.file(
      new URL("fixtures/yc-directory.json", import.meta.url),
    ).json();
    const response = ycDirectoryResponseSchema.parse(raw);
    expect(response.results[0]!.hits.length).toBeGreaterThan(0);
    expect(response.results[0]!.hits[0]!.slug).not.toContain("/");
    expect(
      ycDirectoryResponseSchema.safeParse({
        results: [{ hits: [{ slug: "../../private" }], nbPages: 1, page: 0 }],
      }).success,
    ).toBe(false);
  });
  test("a failing selected search source retains funding RSS leads and reports the failure", async () => {
    const { discoverUrls } = await import("./sources");
    const rule = companySearchInputSchema.parse({
      name: "RSS fallback",
      source: "funding",
    });
    const found = await discoverUrls(
      rule,
      async () => page(),
      async () =>
        "<rss><channel><item><title>Acme raises $5M seed</title><link>https://techcrunch.com/acme-seed/</link><pubDate>Fri, 23 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>",
      async () => {
        throw new Error("Search engines unavailable");
      },
    );
    expect(found.urls).toEqual(["https://techcrunch.com/acme-seed/"]);
    expect(found.errors.join(" ")).toContain("Search engines unavailable");
  });
  test("a homepage mentioning funding stays a company intake; an unlinked funding company needs website confirmation", () => {
    const p = page();
    p.text = "Our team raised $5 million in seed funding.";
    expect(parseCompanyPage(p)!.kind).toBe("manual");
    p.title = "Acme raises $5 million in seed funding";
    p.metadata.publishedAt = "2026-10-24";
    const funding = parseCompanyPage(p, "funding")!;
    expect(funding.kind).toBe("funding");
    expect(funding.website).toBe("");
    expect(funding.amount).toBe("5000000");
  });
  test("a generic address on a structured person remains a hiring inbox and preserves the person", () => {
    const p = page();
    p.metadata.people = [
      {
        name: "Ada Founder",
        role: "Founder",
        email: "careers@company.com",
        profiles: [],
      },
    ];
    const contacts = contactsFromPage(p);
    expect(contacts.find((c) => c.kind === "person")!.methods).toEqual([]);
    expect(
      contacts.find((c) => c.kind === "hiring_inbox")!.methods[0]!.value,
    ).toBe("careers@company.com");
  });
  test("failed official logo refresh cannot replace a previous official logo with a favicon", async () => {
    const p = page(),
      { company } = await persistCandidate(candidate(p));
    p.metadata.images = [
      { url: `${p.url}logo.png`, kind: "logo", source: "website logo" },
      { url: `${p.url}favicon.ico`, kind: "favicon", source: "website icon" },
    ];
    await db
      .update(companies)
      .set({ logoPath: "/previous.png", logoKind: "logo" })
      .where(eq(companies.id, company.id));
    let favicons = 0;
    await enrichCompany(
      company.id,
      "light",
      undefined,
      async () => p,
      async (url) => {
        if (url.includes("favicon")) {
          favicons++;
          return "/new.ico";
        }
        throw new Error("broken primary");
      },
    );
    expect(favicons).toBe(0);
    expect((await getCompany(company.id)).logoPath).toBe("/previous.png");
  });
  test("restart recovery resumes the same persisted company work and skips completed pages", async () => {
    const p = page(),
      submission = await enqueueIntake([p.url]);
    const { company } = await persistCandidate(candidate(p));
    await db
      .update(workItems)
      .set({
        state: "running",
        attempts: 1,
        payload: {
          urls: [p.url],
          outcomes: {
            [p.url]: { url: p.url, state: "new", companyId: company.id },
          },
        },
      })
      .where(eq(workItems.id, submission.workId));
    const { recoverInterruptedWork } = await import("../work/executor");
    await recoverInterruptedWork();
    const [item] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, submission.workId));
    expect(item!.state).toBe("queued");
    let reads = 0;
    await executeCompanyWork(item!, {
      read: async () => {
        reads++;
        return p;
      },
      discover: async () => ({ urls: [], errors: [] }),
      enrich: async () => ({ contacts: 0, pages: 0, errors: [] }),
    });
    expect(reads).toBe(0);
    const [done] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, submission.workId));
    expect(done!.result!.new).toBe(1);
    expect(done!.state).toBe("completed");
  });
  test("retry repeats a failed source without fetching already successful pages", async () => {
    const p = page(),
      submission = await enqueueIntake([p.url]);
    const rule = companySearchInputSchema.parse({
      name: "Partial sources",
      source: "funding",
    });
    const { company } = await persistCandidate(candidate(p));
    await db
      .update(workItems)
      .set({
        state: "partial",
        payload: {
          rule,
          urls: [p.url],
          sourceErrors: ["Provider unavailable"],
          outcomes: {
            [p.url]: { url: p.url, state: "new", companyId: company.id },
          },
        },
      })
      .where(eq(workItems.id, submission.workId));
    const [old] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, submission.workId));
    const run = await retryCompanyRun([old!], "Source retry");
    const { getRun } = await import("../work/work.service");
    const retried = (await getRun(run.runId)).items[0]!;
    let discoveries = 0,
      reads = 0;
    await executeCompanyWork(retried, {
      read: async () => {
        reads++;
        return p;
      },
      discover: async () => {
        discoveries++;
        return { urls: [p.url], errors: [] };
      },
      enrich: async () => ({ contacts: 0, pages: 0, errors: [] }),
    });
    expect(discoveries).toBe(1);
    expect(reads).toBe(0);
    const [done] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, retried.id));
    expect(done!.state).toBe("completed");
  });
  test("search API returns a persisted run immediately, pausing rejects runs, and contacts validate source/verification", async () => {
    const { companyDiscoveryRoutes } = await import("./routes");
    const { Hono } = await import("hono"),
      { handleError } = await import("../../shared/http/error-handler");
    const routes = new Hono();
    routes.route("/", companyDiscoveryRoutes);
    routes.onError(handleError);
    const post = (url: string, body: unknown, method = "POST") =>
      routes.request(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const created = await post("/searches", {
      name: "API search",
      source: "funding",
      schedule: "manual",
    });
    expect(created.status).toBe(201);
    const search = (await created.json()) as { id: string };
    const running = await post(`/searches/${search.id}/run`, {});
    expect(running.status).toBe(202);
    const run = (await running.json()) as { runId: string };
    const { getRun } = await import("../work/work.service");
    expect((await getRun(run.runId)).items[0]!.payload!.revision).toBe(1);
    await post(
      `/searches/${search.id}`,
      {
        name: "API search",
        source: "funding",
        schedule: "manual",
        paused: true,
      },
      "PUT",
    );
    expect((await post(`/searches/${search.id}/run`, {})).status).toBe(409);
    const { company } = await persistCandidate(candidate());
    const invalid = await post(`/companies/${company.id}/contacts`, {
      kind: "person",
      name: "Ada",
      role: "CEO",
      methods: [
        {
          kind: "email",
          value: "ada@company.com",
          sourceUrl: company.website,
          status: "mailbox_verified",
          provider: "Unproven",
          verifiedAt: now(),
          checkedAt: now(),
        },
      ],
    });
    expect(invalid.status).toBe(400);
  });
});
