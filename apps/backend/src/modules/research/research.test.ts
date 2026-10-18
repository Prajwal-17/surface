import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
const directory = mkdtempSync(join(tmpdir(), "surface-research-test-"));
process.env.DB_FILE_NAME = join(directory, "test.sqlite");
process.env.OMNIROUTE_API_KEY = "test-key";
process.env.OMNIROUTE_BASE_URL = "http://model.test/v1";
process.env.SEARXNG_BASE_URL = "http://search.test";
process.env.CRAWLER_BASE_URL = "http://crawler.test";
const { runMigrations } = await import("../../infrastructure/database/migrate");
const { db, sqlite } = await import("../../infrastructure/database/client");
const service = await import("./research.service");
const { companyDomain, normalizedName, inputUrl, citeMarkdown } =
  await import("./evidence");
const { decodeResearchResponse } = await import("./model");
const { canRequestModel, getSettings } = await import("../analysis/settings");
const { requestModelJson } = await import("../../shared/model-client");
const { companies } = await import("../workspace/workspace.tables");
const { researchRuns, researchSources } = await import("./research.tables");
const { app } = await import("../../app");
const { eq } = await import("drizzle-orm");
const originalFetch = globalThis.fetch;
let network: string[] = [],
  modelBodies: Record<string, any>[] = [];
let mode: "normal" | "tool" | "fail" | "wait" | "bad-citation" = "normal";
let toolSent = false;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
beforeAll(() => {
  runMigrations();
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    network.push(url);
    if (url.startsWith("http://search.test"))
      return json({
        results: [
          {
            url: "https://example.com/careers",
            title: "Example Careers",
            content: "India engineering roles.",
          },
        ],
      });
    if (url.startsWith("http://crawler.test")) {
      if (url.includes("/cancel")) return json({ ok: true });
      const body = JSON.parse(String(init?.body));
      return json({
        url: body.url,
        title: "Example",
        text: "Example builds developer tools. Its careers page lists engineering roles in India. No product license was found. ".repeat(
          3,
        ),
        links: [{ url: "https://example.com/careers", title: "Careers" }],
        status: "ok",
        retrievedAt: new Date().toISOString(),
      });
    }
    if (url.startsWith("http://model.test")) {
      const body = JSON.parse(String(init?.body));
      modelBodies.push(body);
      if (mode === "wait")
        return await new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        });
      if (mode === "fail")
        return new Response("Provider failed", { status: 503 });
      if (body.response_format?.json_schema.name === "unlimited_test")
        return json({
          model: "test",
          choices: [{ message: { content: '{"ok":true}' } }],
        });
      if (
        body.tools?.some((t: any) => t.function.name === "inspect_company_link")
      ) {
        const inspected = body.messages.findLast((m: any) => m.role === "tool");
        const company = JSON.parse(body.messages[1].content).company;
        const selection = inspected ? JSON.parse(inspected.content) : null;
        return json({
          model: "test",
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "verify-call",
                    type: "function",
                    function: {
                      name: inspected
                        ? "publish_company_links"
                        : "inspect_company_link",
                      arguments: JSON.stringify(
                        inspected
                          ? {
                              links: selection.id
                                ? [
                                    {
                                      sourceId: selection.id,
                                      category: "Website",
                                      label: "Official website",
                                      reason:
                                        "Describes the company's developer tools.",
                                    },
                                  ]
                                : [],
                            }
                          : { url: company.website },
                      ),
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      if (mode === "tool" && !toolSent) {
        toolSent = true;
        return json({
          model: "test",
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call1",
                    type: "function",
                    function: {
                      name: "crawl_page",
                      arguments: '{"url":"https://example.com/careers"}',
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      const source =
        /"id":"([\w-]+)","companyId"/.exec(
          JSON.stringify(body.messages).replaceAll('\\"', '"'),
        )?.[1] ?? db.select().from(researchSources).all().at(-1)?.id;
      return json({
        model: "test",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: source
                ? `## What the company does\nExample builds developer tools. [S:${mode === "bad-citation" ? "outside-company" : source}]\n\n## Hiring from India\nVerify current role eligibility.\n\n## Open-source status\nUnknown; a public repository alone does not establish a product license.`
                : "The saved evidence does not answer this. Enable Search web to investigate.",
            },
          },
        ],
      });
    }
    throw new Error(`Unexpected network destination ${url}`);
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  sqlite.close();
  rmSync(directory, { recursive: true });
});
async function finish(run: { id: string }) {
  for (let i = 0; i < 200; i++) {
    const row = db
      .select()
      .from(researchRuns)
      .where(eq(researchRuns.id, run.id))
      .get()!;
    if (row.state !== "running") return row;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Run did not finish");
}
let owner: ReturnType<typeof service.confirmCompany>;
describe("company research", () => {
  test("migration removes quota storage and creates research relationships", () => {
    expect(
      sqlite
        .query("SELECT name FROM sqlite_schema WHERE name='ai_usage'")
        .get(),
    ).toBeNull();
    const columns = sqlite
      .query("PRAGMA table_info(analysis_settings)")
      .all() as { name: string }[];
    expect(columns.map((c) => c.name)).toEqual(["id", "enabled", "paused"]);
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  test("normalized identities reopen companies and survive renaming", async () => {
    expect(inputUrl("example.com/about")).toBe("https://example.com/about");
    expect(companyDomain("https://www.Example.com/about")).toBe("example.com");
    expect(normalizedName(" Example, INC. ")).toBe("example inc");
    owner = service.confirmCompany({
      name: "Example",
      website: "https://example.com",
      description: "",
    });
    expect(
      service.confirmCompany({
        name: "Another spelling",
        website: "https://www.example.com/about",
        description: "",
      }).id,
    ).toBe(owner.id);
    expect((await service.resolveCompany("EXAMPLE")).companyId).toBe(owner.id);
    db.update(companies)
      .set({ name: "Example Tools" })
      .where(eq(companies.id, owner.id))
      .run();
    expect((await service.resolveCompany("example.com")).companyId).toBe(
      owner.id,
    );
  });
  test("same names on different domains remain separate", async () => {
    service.confirmCompany({
      name: "Example Tools",
      website: "https://another.example",
      description: "",
    });
    const result = await service.resolveCompany("Example Tools");
    expect(result.companyId).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });
  test("report searches, crawls, validates citations and persists", async () => {
    const run = await finish(service.startResearch(owner.id));
    expect(run.state).toBe("completed");
    const data = service.details(owner.id);
    expect(data.reports).toHaveLength(1);
    expect(data.sources.length).toBeGreaterThan(1);
    expect(data.reports[0]!.sourceIds.length).toBeGreaterThan(0);
    expect(data.reports[0]!.markdown).toContain("](https://");
  });
  test("AI-reviewed links persist independently and failed rechecks preserve the selection", async () => {
    mode = "normal";
    const before = service.details(owner.id);
    expect(before.linkReview?.links.length).toBe(1);
    const run = service.startResearch(owner.id, undefined, true);
    expect((await finish(run)).state).toBe("completed");
    const reviewed = service.details(owner.id);
    expect(reviewed.reports).toEqual(before.reports);
    expect(reviewed.messages).toEqual(before.messages);
    expect(reviewed.linkReview?.runId).toBe(run.id);
    expect(reviewed.linkReview?.links[0]?.sourceId).toBeTruthy();
    mode = "fail";
    expect(
      (await finish(service.startResearch(owner.id, undefined, true))).state,
    ).toBe("failed");
    expect(service.details(owner.id).linkReview).toEqual(reviewed.linkReview);
    mode = "normal";
  });
  test("default Q&A cannot search/crawl and receives only company evidence", async () => {
    network = [];
    modelBodies = [];
    const response = await app.request(
      `/api/companies/${owner.id}/research/questions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Do they hire from India?" }),
      },
    );
    expect(response.status).toBe(202);
    const run = await finish(await response.json());
    expect(run.state).toBe("completed");
    expect(network.every((url) => url.startsWith("http://model.test"))).toBe(
      true,
    );
    expect(modelBodies[0]!.tools).toBeUndefined();
    expect(JSON.stringify(modelBodies)).not.toContain("another.example");
    expect(service.details(owner.id).messages.at(-1)?.webSearch).toBe(false);
  });
  test("explicit web Q&A executes a custom tool and preserves the report", async () => {
    network = [];
    mode = "tool";
    toolSent = false;
    const run = await finish(
      service.startResearch(owner.id, {
        question: "Check current careers",
        webSearch: true,
      }),
    );
    expect(run.state).toBe("completed");
    expect(network.some((url) => url.startsWith("http://crawler.test"))).toBe(
      true,
    );
    expect(service.details(owner.id).reports).toHaveLength(1);
    mode = "normal";
  });
  test("provider failures and invalid citations preserve previous reports", async () => {
    mode = "fail";
    await finish(service.startResearch(owner.id));
    expect(service.details(owner.id).reports).toHaveLength(1);
    mode = "bad-citation";
    const run = await finish(service.startResearch(owner.id));
    expect(run.error).toContain("outside");
    expect(service.details(owner.id).reports).toHaveLength(1);
    mode = "normal";
  });
  test("duplicate operations are rejected; cancel aborts model work", async () => {
    mode = "wait";
    const run = service.startResearch(owner.id, {
      question: "Wait",
      webSearch: false,
    });
    expect(() => service.startResearch(owner.id)).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    service.cancelResearch(owner.id, run.id);
    expect((await finish(run)).state).toBe("cancelled");
    mode = "normal";
  });
  test("restart recovery retains evidence and exposes interrupted state", () => {
    db.insert(researchRuns)
      .values({
        id: "interrupted-test",
        companyId: owner.id,
        kind: "report",
        state: "running",
        createdAt: new Date().toISOString(),
      })
      .run();
    service.recoverResearch();
    expect(
      db
        .select()
        .from(researchRuns)
        .where(eq(researchRuns.id, "interrupted-test"))
        .get()?.state,
    ).toBe("interrupted");
    expect(service.details(owner.id).reports).toHaveLength(1);
  });
  test("more than 20 model requests succeed without a quota or reset", async () => {
    for (let i = 0; i < 25; i++) {
      expect(canRequestModel(true, true)).toBe(true);
      expect(
        (
          await requestModelJson(
            z.object({ ok: z.boolean() }),
            "unlimited_test",
            "Test",
            {},
            20,
          )
        ).output.ok,
      ).toBe(true);
    }
    expect(getSettings()).not.toHaveProperty("dailyLimit");
    expect(getSettings()).not.toHaveProperty("used");
  });
  test("SSE events replay and company ownership is checked", async () => {
    const run = service
      .details(owner.id)
      .runs.find((r) => r.state === "completed")!;
    const response = await app.request(
      `/api/companies/${owner.id}/research/runs/${run.id}/events`,
    );
    expect(await response.text()).toContain("event: done");
    const other = service.library().find((row) => row.company.id !== owner.id)!;
    expect(
      (
        await app.request(
          `/api/companies/${other.company.id}/research/runs/${run.id}/events`,
        )
      ).status,
    ).toBe(404);
  });
});
test("research SSE decoder assembles fragmented tool arguments", async () => {
  const events = [
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "c1",
                type: "function",
                function: { name: "search_web", arguments: '{"query":' },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"company"}' } }],
          },
          finish_reason: "tool_calls",
        },
      ],
    },
  ];
  const response = new Response(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  );
  const result = await decodeResearchResponse(response, () => {});
  expect(result.message.tool_calls?.[0]?.function.arguments).toBe(
    '{"query":"company"}',
  );
});
test("foreign citations and invented URLs cannot become saved report links", () => {
  expect(() => citeMarkdown("A fact [S:foreign]", [])).toThrow();
  expect(() => citeMarkdown("[Fake](https://invented.example)", [])).toThrow();
});
test("grouped citations validate every source and reject hidden invented URLs", () => {
  const source = {
    id: "one",
    companyId: "c",
    runId: "r",
    url: "https://example.com/",
    title: "Example",
    kind: "page" as const,
    text: "Evidence",
    links: [],
    status: "ok",
    retrievedAt: "2026-09-09",
  };
  const second = { ...source, id: "two", url: "https://example.com/about" };
  const result = citeMarkdown("Fact [S:one, S:two].", [source, second]);
  expect(result.sourceIds).toEqual(["one", "two"]);
  expect(result.markdown).toBe(
    "Fact [1](https://example.com/) [2](https://example.com/about).",
  );
  expect(() => citeMarkdown("Fact [S:one, S:foreign]", [source])).toThrow();
  expect(() =>
    citeMarkdown(
      "[Invented][link]\n\n[link]: https://invented.example\nFact [S:one]",
      [source],
    ),
  ).toThrow();
  expect(() =>
    citeMarkdown("<https://invented.example> Fact [S:one]", [source]),
  ).toThrow();
});

test("link selection rejects uninspected, blocked, empty and duplicate destinations", async () => {
  const { validateLinkSelection } = await import("./verified-links");
  const page = {
    id: "page",
    companyId: "company",
    runId: "run",
    kind: "page" as const,
    url: "https://example.com/",
    title: "Example",
    text: "Useful company content. ".repeat(20),
    links: [],
    status: "ok",
    retrievedAt: new Date().toISOString(),
  };
  const choice = {
    sourceId: "page",
    category: "Website",
    label: "Example",
    reason: "Explains the company products.",
  };
  expect(() => validateLinkSelection({ links: [choice] }, new Map())).toThrow();
  for (const source of [
    { ...page, status: "blocked" },
    { ...page, text: "Not found" },
    { ...page, kind: "search" as const },
  ])
    expect(() =>
      validateLinkSelection({ links: [choice] }, new Map([["page", source]])),
    ).toThrow();
  expect(() =>
    validateLinkSelection(
      { links: [choice, choice] },
      new Map([["page", page]]),
    ),
  ).toThrow();
  expect(
    validateLinkSelection({ links: [choice] }, new Map([["page", page]]))[0]
      ?.url,
  ).toBe(page.url);
});
