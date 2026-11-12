import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { CheerioCrawlingContext } from "crawlee";
const { load } = createRequire(import.meta.url)("cheerio") as {
  load: (html: string) => CheerioCrawlingContext["$"];
};
import { extractPage } from "./extract.ts";
test("captures footer contacts, explicit person context, logo and JSON-LD before cleanup", () => {
  const $ = load(
    `<html><head><title>Company</title><meta name="description" content="Builds software"><link rel="icon" href="/favicon.png"><script type="application/ld+json">{"@type":"Organization","name":"Company","logo":"/logo.svg","founder":{"@type":"Person","name":"Ada Founder","jobTitle":"CEO","email":"ada@company.com","sameAs":["https://www.linkedin.com/in/ada"]}}</script></head><body><header><img alt="Company logo" src="/logo.png"></header><main><p>Our company creates useful tools.</p></main><footer><div itemscope itemtype="https://schema.org/Person"><span itemprop="name">Ada Founder</span><span itemprop="jobTitle">CEO</span><a href="mailto:ada%40company.com?subject=Hi">Email Ada</a></div><a href="mailto:careers@company.com">Careers</a><a href="https://company.com/team">Team</a></footer></body></html>`,
  );
  const p = extractPage($, "https://company.com");
  assert.equal(p.metadata!.description, "Builds software");
  assert(
    p.metadata!.emails.some(
      (e) => e.email === "ada@company.com" && e.name === "Ada Founder",
    ),
  );
  assert(p.metadata!.emails.some((e) => e.email === "careers@company.com"));
  assert(
    p.metadata!.people.some(
      (person) =>
        person.name === "Ada Founder" && person.email === "ada@company.com",
    ),
  );
  assert(
    p.metadata!.images.some(
      (i) => i.kind === "logo" && i.url === "https://company.com/logo.svg",
    ),
  );
  assert(p.metadata!.images.some((i) => i.kind === "favicon"));
  assert(!p.links.some((l) => l.url.startsWith("mailto:")));
  assert(p.links.some((l) => l.url === "https://company.com/team"));
  assert(!p.text.includes("Email Ada"));
});
test("YC has_email flags never produce guessed addresses; public profile identity is structured", () => {
  const data = {
    props: {
      company: {
        id: 123,
        name: "Example",
        slug: "example",
        website: "https://example.com",
        batch_name: "Fall 2026",
        small_logo_url: "https://images.example.com/logo.png",
        founders: [
          {
            full_name: "Jane Founder",
            title: "Founder",
            has_email: true,
            linkedin_url: "https://linkedin.com/in/jane",
          },
        ],
      },
    },
  };
  const $ = load(
    `<html><body><main>Example company</main><div data-page='${JSON.stringify(data)}'></div></body></html>`,
  );
  const result = extractPage(
    $,
    "https://www.ycombinator.com/companies/example",
  );
  assert.equal(result.metadata!.directoryCompany!.id, 123);
  assert.equal(result.metadata!.people[0]!.name, "Jane Founder");
  assert.equal(result.metadata!.people[0]!.email, undefined);
  assert.deepEqual(result.metadata!.emails, []);
});

test("missing logo and profile values do not become invented relative URLs", () => {
  const $ = load(
    '<html><head><script type="application/ld+json">{"@type":"Organization","name":"Example","founder":{"@type":"Person","name":"Ada Founder","jobTitle":"Founder"}}</script></head><body><main>Example</main></body></html>',
  );
  const page = extractPage($, "https://example.com");
  assert.deepEqual(page.metadata!.images, []);
  assert.deepEqual(page.metadata!.people[0]!.profiles, []);
});
