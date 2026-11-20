# Find leads — guided discovery, seed sources, and rendered fetch

Plan for the lead-discovery feature: preset-driven criteria (no manual keyword typing),
seed sources ("where to look"), a rendered-fetch fallback for JS-heavy sites, and a
compact UI for both the form and run progress.

Reference implementation for the fetch pipeline: `/mnt/hdd/code/oss/firecrawl`.

---

## 1. Goals

1. A run can be configured entirely from prefilled, searchable option sets —
   no free-text keyword entry required.
2. The user can point the agent at known directories (YC, startups.gallery,
   Product Hunt…) without pasting URLs into a text field.
3. JS-rendered pages are readable through a browser-render fallback that only
   engages when the plain fetch fails (per the agreed tier ladder).
4. Any field or section can be hidden/collapsed so it doesn't interfere.
5. The form and run progress show only what is required, in compact form,
   with factual (deterministic) text — no generated filler.

Non-goals for this iteration: scheduled runs, saved searches, agent-typed logins,
clicking/interacting with pages. These build on this plan later.

---

## 2. Criteria model v2 (backend)

Current: `DiscoveryCriteria` is five free-text strings plus `limit`
([leads.repository.ts:24](apps/backend/src/modules/leads/leads.repository.ts)).

New shape:

```ts
type SeedSource = {
  domain: string; // e.g. "ycombinator.com"
  mode: "search" | "fetch"; // search inside it vs fetch listing pages
};

type DiscoveryCriteria = {
  goal: string; // optional plain-language description
  industries: string[]; // multi-select presets (+ custom)
  geographies: string[];
  companyTypes: string[]; // stage / size presets
  signals: string[];
  exclusions: string[];
  seedSources: SeedSource[];
  limit: number;
};
```

Rules:

- Every `string` field becomes a `string[]`. Old runs keep their stored JSON;
  `parseRunCriteria` upgrades legacy shapes by wrapping each old string into a
  one-element array (`industry: ""` → `[]`).
- Criteria validation moves to one zod schema in the backend
  (`leads.routes.ts` POST) shared with the web client via the existing types
  module; max ~8 entries per array, max 5 seed sources, values trimmed and
  length-capped.
- `discoveryInstructions` (lead-agent.ts) renders arrays as comma lists. With
  seed sources present, workflow step 1 becomes: "Start with the seed sources —
  search inside each seed domain (`site:<seed> <criteria>`) or fetch its listing
  pages — then run your own searches only if the seeds don't fill the quota."

Schema change is criteria-JSON-only; the `discovery_runs.criteria` column stays
TEXT. No DB migration beyond versioning the JSON (`v: 2` marker when written).

---

## 3. Option catalogs (shared package)

A new `packages/shared/src/leads/catalogs.ts` (web + backend import it):

```ts
type CatalogOption = { id: string; label: string; hint?: string };
type Catalog = { id: string; options: CatalogOption[] };
```

Starter catalogs, all static data (~40–60 options each, single source of truth):

| Catalog       | Examples                                                                              |
| ------------- | ------------------------------------------------------------------------------------- |
| Industries    | B2B developer tools, Fintech, Healthtech, DevOps, Security, Data/AI infra…            |
| Geographies   | United States, Europe, India, Remote-first, LATAM…                                    |
| Company types | Seed stage, Series A, 1–50 people, Open-source, Hiring now…                           |
| Signals       | Recently funded, Hiring engineers, New product launch, Launched on PH…                |
| Exclusions    | Agencies, Consultancies, Marketplaces, Enterprise vendors…                            |
| Seed sources  | YC directory, Product Hunt, Show HN, Who-is-hiring, startups.gallery, AllTopStartups… |

Seed-source presets carry a `mode` and optional `queryHint`:

```ts
{ id: "yc", domain: "ycombinator.com", mode: "search",
  queryHint: "site:ycombinator.com companies {criteria}" }
```

Free-text stays available as "Other…" in each picker for values the catalog
doesn't cover — presets are the default path, not a cage.

---

## 4. Fetch pipeline: engine ladder + rendered fetch

### 4.1 Engine ladder (modeled on firecrawl's `scrapeURL/engines/index.ts`)

Firecrawl picks an engine per URL with per-engine time budgets and falls back on
failure. We adopt the pattern, scaled down to two engines:

```
fetchSource(url)
  ├─ engine: fetch      (existing plain HTTP path — unchanged, ~100ms)
  │    └─ failure: "not enough readable text", content-type HTML but thin
  │       body, or fetch-level error on a public HTTP(S) page
  └─ engine: render     (new — tier-2, only here)
       └─ failure: report "unreadable source" to the run, consume budget
```

The agent keeps calling only `fetchSource`; the ladder is internal. No new tool
surface, no prompt changes for engine choice.

### 4.2 Rendered fetch via Electron (desktop main process)

The backend is a separate process; rendering must happen in Electron's main
process, which owns Chromium.

- New desktop module `apps/desktop/src/render-fetch.ts`:
  `renderFetch(url) -> { url, title, text, renderedAt }`.
  One hidden `BrowserWindow` at a time (`show: false`, dedicated
  `session.fromPartition("leads-render")`, destroy after read), hard timeout
  ~20s, cap text at the existing `MAX_EXCERPT` (7k).
- Wait strategy: `did-finish-load` → poll `innerText` until stable across two
  samples 500ms apart, then extract (firecrawl's per-engine timeouts, simplified).
- Transport: the existing backend↔desktop channel ([channel.ts]) gains a
  `render-fetch` request/response method; the backend calls it with its own
  timeout and treats the desktop as unavailable → engine falls back to
  reporting the source as unreadable (degrade, don't fail the run).
- `fetchSourcePage` gains a `rendered: boolean` field on the source record so
  run events can show which engine produced each source.

### 4.3 Security pieces ported from firecrawl

From `apps/playwright-service-ts/helpers/ssrf.ts`:

- **DNS pinning.** Current `fetch-source.ts` resolves, validates, then lets
  `fetch` re-resolve (TOCTOU gap). Adopt their `resolvePublicAddresses` +
  `pinnedLookup` pattern: resolve once, check all addresses are unicast/public,
  then connect only to the approved address. For the render engine, the same
  guard runs before any navigation; the render session additionally gets a
  `webRequest` block rule for private-IP hosts (defense in depth, since the
  window resolves DNS itself).

From `apps/api/src/scraper/scrapeURL/transformers/promptInjectionGuard.ts`:

- **Injection screening.** Extracted page text is already treated as untrusted
  in prompts; additionally run a lightweight guard over excerpts before they are
  shown as evidence/summaries: flag lines matching imperative patterns
  ("ignore previous", "call this API", …) and strip them from the excerpt the
  model sees. Port the idea, not the whole transformer (ours is a subset of
  formats).

Budget: render fetches count against the same `budget.fetches` cap (10) and run
timeout (5 min). Add a per-run `renders` counter with a lower cap (4) so a
directory-heavy run can't spend its whole budget on slow pages.

### 4.4 Login sessions (design slot, not built now)

The plan reserves a `persist:leads-login` partition and a per-seed-source
"auth: none | session" flag so tier 3 (user logs in once in a visible window,
agent borrows the session read-only) can be added without another schema
migration. Nothing ships in this iteration.

---

## 5. UI — form redesign (web, `find-leads.tsx`)

### 5.1 Layout principle

One card, five compact rows, every row collapsible. Vertical order = decision
order (where → who → signs → rules → start).

```
┌ Discovery ───────────────────────────────────────────────┐
│ Where to look   [YC companies ×] [Product Hunt ×] [+ Add]│  [Hide]
│ Who             [B2B dev tools ×] [US ×] [Seed stage ×]  │  [Hide]
│                 [+ Add]  ·  Goal (optional, collapsed)   │
│ Signals         [Recently funded ×] [Hiring ×]  [+ Add]  │  [Hide]
│ Exclusions      [Agencies ×] [Consultancies ×]  [+ Add]  │  [Hide]
│ Limit [5 ▾]                              [Start run]     │
└──────────────────────────────────────────────────────────┘
```

- **Multi-select combobox with search** replaces every text field: dropdown
  opens on focus, type-to-filter over the catalog, multi-select, selected
  values render as removable chips, "Other…" entry allows custom values.
  (Radix `Popover` + `Command` (cmdk) is the standard build; one shared
  `MultiSelect` component in `@/components/ui/multiselect.tsx`.)
- **Hide button**: each row gets a Hide control that collapses it to a single
  summary line ("3 selected"). Hidden rows with values stay visible as the
  summary; hidden empty rows disappear entirely. State is local + persisted to
  `localStorage` so a user's preferred layout survives restarts.
- The old free-text textareas are reachable via "Other…" on each combobox —
  nothing is removed, typing is just no longer the primary path.
- Settings card stays as-is (already collapsible).

### 5.2 Run progress — compact, factual

Two changes:

1. **Progress strip on the run detail card** (always visible while a run is
   active, one line):
   `Searching · 3/6 searches · 5/10 pages · 2 saved · 1 skipped · 1 rendered`
   fed from `updateRunProgress` counters — no prose.
2. **Deterministic summaries.** Today `finishRun` stores whatever the model
   wrote (`budget.saved` line is only a fallback). Change: the stored summary is
   composed from counters, not the model —
   `Saved 3 leads from 5 sources (2 rendered). Skipped 2 duplicates.` The
   model's closing text moves to a "Notes" line, capped, rendered muted, or
   omitted when it adds nothing. Event rows stay terse: action icon + domain +
   query/page title (already mostly true in run events).

This is the "no AI slop" requirement enforced structurally: counts are data,
not generated text.

---

## 6. Milestones

| #   | Scope                                                                                                             | Verify                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| M0  | HTML mockup of the new form + progress strip (static, existing `find-leads-mockup.html` replaced)                 | Visual review at real window sizes                                                                          |
| M1  | Criteria v2: zod schema, shared catalogs, legacy parse, agent instructions update                                 | `bun run check-types`; API test: create run with arrays; legacy JSON still parses                           |
| M2  | Form UI: `MultiSelect`, five rows, hide/collapse, chip summaries, localStorage                                    | Manual run end-to-end: pick only presets, run completes                                                     |
| M3  | Rendered fetch: desktop `renderFetch`, channel method, engine ladder, DNS pinning, injection guard, render budget | Run against `ycombinator.com` seed and one Framer site: run events show `rendered` sources with real titles |
| M4  | Compact progress strip + deterministic summaries                                                                  | Active run shows live counts; summary text contains no model prose                                          |

M1–M2 are shippable without M3 (seeds work through SearXNG `site:` queries
already); M3 makes JS-heavy seeds actually productive; M4 is polish but cheap
and worth bundling with M2.

---

## 7. Risks / open points

- **Engine fallback loops:** a JS-only site with infinite spinner must hit the
  20s cap and count once, never retry forever. Cap per-URL render attempts to 1
  per run.
- **Render budget vs directories:** directory pages can be long; the 7k excerpt
  may cut the list. Mitigation: render engine takes up to 2 "pages" for seed
  listing URLs only (scroll + collect), still one budget unit.
- **TOCTOU for the render window:** Electron resolves DNS inside Chromium;
  pinning is approximated by pre-check + `webRequest` blocking private ranges.
  Accepted residual risk, same posture as today's plain fetch.
- **Old clients:** web and backend ship in lockstep (single repo, same release)
  so no version negotiation is needed; legacy criteria parsing stays forever.
- **Catalog drift:** catalogs are static; adding an option is a one-line data
  change, and "Other…" keeps the form usable between catalog updates.
