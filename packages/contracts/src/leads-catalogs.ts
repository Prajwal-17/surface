import { z } from "zod";

/**
 * Shared catalogs for the lead discovery form. Static, single source of truth
 * for both the web client and the backend. Adding an option is a one-line data
 * change; every picker also offers a free-text "Other…" entry, so the presets
 * are the default path, not a cage.
 */

export type CatalogOption = {
  id: string;
  label: string;
  hint?: string;
};

export type Catalog = {
  id: string;
  options: CatalogOption[];
};

export type SeedSourceMode = "search" | "fetch";

export type SeedSourceOption = CatalogOption & {
  domain: string;
  mode: SeedSourceMode;
  queryHint?: string;
};

export type SeedSource = {
  domain: string;
  mode: SeedSourceMode;
  /** Catalog preset id, when the seed was chosen from the catalog. */
  id?: string;
};

const option = (id: string): CatalogOption => ({ id, label: id });

export const industriesCatalog: Catalog = {
  id: "industries",
  options: [
    "B2B developer tools",
    "DevOps and platform engineering",
    "Data and AI infrastructure",
    "Developer-first SaaS",
    "Fintech",
    "Payments",
    "Insurtech",
    "Healthtech",
    "Biotech",
    "Digital health",
    "Cybersecurity",
    "Privacy and compliance",
    "E-commerce tooling",
    "Retail tech",
    "Logistics and supply chain",
    "HR tech",
    "Recruiting tech",
    "Sales automation",
    "Marketing automation",
    "Customer support software",
    "Analytics and BI",
    "Design tools",
    "No-code and low-code",
    "APIs and developer services",
    "Cloud cost management",
    "Open-source infrastructure",
    "Robotics",
    "Industrial IoT",
    "Energy and climate tech",
    "Edtech",
    "Legal tech",
    "Proptech",
    "Gaming tools",
    "Creator economy tools",
    "Web3 infrastructure",
    "Consulting",
  ].map(option),
};

export const geographiesCatalog: Catalog = {
  id: "geographies",
  options: [
    "United States",
    "United Kingdom",
    "Germany",
    "France",
    "Netherlands",
    "Nordics",
    "DACH",
    "Europe",
    "India",
    "Singapore",
    "Australia",
    "Canada",
    "LATAM",
    "Brazil",
    "Mexico",
    "Southeast Asia",
    "Japan",
    "South Korea",
    "Middle East",
    "Africa",
    "Remote-first",
    "Remote (US time zones)",
    "Remote (Europe time zones)",
  ].map(option),
};

export const companyTypesCatalog: Catalog = {
  id: "company-types",
  options: [
    "Seed stage",
    "Series A",
    "Series B",
    "Bootstrapped",
    "1–10 people",
    "1–50 people",
    "50–200 people",
    "Open-source",
    "API-first",
    "Hiring engineers",
    "Hiring now",
    "Developer-led",
    "Product-led growth",
    "Freemium",
    "Self-serve",
    "Enterprise vendors",
    "SMB-focused",
    "Startup (under 5 years old)",
  ].map(option),
};

export const signalsCatalog: Catalog = {
  id: "signals",
  options: [
    "Recently funded",
    "Raised seed round",
    "Raised Series A",
    "Hiring engineers",
    "Hiring sales",
    "New product launch",
    "Launched on Product Hunt",
    "Launched on Show HN",
    "Growing headcount",
    "New engineering blog",
    "Open-source project gaining traction",
    "Migrating tooling",
    "Building an AI product",
    "Expanding to new market",
    "New CTO or VP Engineering",
    "Publishing technical content",
  ].map(option),
};

export const exclusionsCatalog: Catalog = {
  id: "exclusions",
  options: [
    "Agencies",
    "Consultancies",
    "Outsourcing firms",
    "Staffing and recruiting firms",
    "Marketplaces",
    "Enterprise vendors",
    "Competitors",
    "Customers",
    "Public companies",
    "Large tech",
    "Crypto projects",
    "Adtech",
    "Gambling",
    "Adult content",
    "Universities",
    "Non-profits",
  ].map(option),
};

const seedSource = (
  id: string,
  domain: string,
  mode: SeedSourceMode,
  queryHint?: string,
): SeedSourceOption => ({
  id,
  label: id,
  domain,
  mode,
  queryHint,
});

export const seedSourcesCatalog: { id: string; options: SeedSourceOption[] } = {
  id: "seed-sources",
  options: [
    seedSource(
      "YC companies",
      "ycombinator.com",
      "search",
      "site:ycombinator.com companies {criteria}",
    ),
    seedSource(
      "Show HN",
      "news.ycombinator.com",
      "search",
      "site:news.ycombinator.com Show HN {criteria}",
    ),
    seedSource(
      "Who is hiring",
      "news.ycombinator.com",
      "search",
      "site:news.ycombinator.com \"Who is hiring\" {criteria}",
    ),
    seedSource(
      "Product Hunt",
      "producthunt.com",
      "search",
      "site:producthunt.com {criteria}",
    ),
    seedSource(
      "Work at a Startup",
      "workatastartup.com",
      "search",
      "site:workatastartup.com {criteria}",
    ),
    seedSource(
      "Crunchbase",
      "crunchbase.com",
      "search",
      "site:crunchbase.com/organization {criteria}",
    ),
    seedSource("Indie Hackers", "indiehackers.com", "search"),
    seedSource("startups.gallery", "startups.gallery", "fetch"),
    seedSource("AllTopStartups", "alltopstartups.com", "fetch"),
    seedSource("BetaList", "betalist.com", "fetch"),
    seedSource("EU-Startups", "eu-startups.com", "fetch"),
    seedSource("TechCrunch startups", "techcrunch.com", "search"),
  ],
};

export function seedSourceOptionForDomain(
  domain: string,
): SeedSourceOption | null {
  const normalized = domain.trim().toLowerCase();
  return (
    seedSourcesCatalog.options.find(
      (source) => source.domain.toLowerCase() === normalized,
    ) ?? null
  );
}

/** Finds the catalog preset a stored seed came from, by id or domain. */
export function seedSourcePresetFor(entry: SeedSource): SeedSourceOption | null {
  return (
    (entry.id
      ? seedSourcesCatalog.options.find((preset) => preset.id === entry.id)
      : undefined) ??
    seedSourcesCatalog.options.find((preset) => preset.domain === entry.domain) ??
    null
  );
}

const criterionList = (maxChars: number) =>
  z
    .array(z.string().trim().min(1).max(maxChars))
    .max(8)
    .optional()
    .default([] as string[]);

export const seedSourceSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .transform((value) => value.toLowerCase().replace(/^www\./, "")),
  mode: z.enum(["search", "fetch"]),
  /** Preset identifier, kept so catalog hints survive a run round-trip. */
  id: z.string().trim().min(1).max(120).optional(),
});

export const discoveryCriteriaSchema = z
  .object({
    goal: z.string().trim().max(500).optional().default(""),
    industries: criterionList(120),
    geographies: criterionList(120),
    companyTypes: criterionList(120),
    signals: criterionList(120),
    exclusions: criterionList(120),
    seedSources: z.array(seedSourceSchema).max(5).optional().default([]),
    limit: z.number().int().min(1).max(15).default(5),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.industries.length ||
          value.geographies.length ||
          value.companyTypes.length ||
          value.signals.length,
      ),
    "Add at least one search criterion.",
  );

export type DiscoveryCriteria = z.infer<typeof discoveryCriteriaSchema>;

export type ResearchCriteria = {
  companyId: string;
  question: string;
};

export type RunCriteria = DiscoveryCriteria | ResearchCriteria;

function isLegacyDiscovery(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> & {
  industry?: unknown;
  geography?: unknown;
  companyType?: unknown;
} {
  return typeof value?.industry === "string";
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean)
      .slice(0, 8);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * Upgrades stored criteria JSON to the current shape. Legacy runs stored five
 * free-text strings; each old string becomes a one-element array (an empty
 * string becomes `[]`). Current runs keep their arrays and gain the optional
 * `goal` and any missing list fields.
 */
export function normalizeDiscoveryCriteria(
  value: unknown,
): DiscoveryCriteria | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const source: Record<string, unknown> = isLegacyDiscovery(record)
    ? {
        ...record,
        industries: record.industry,
        geographies: record.geography,
        companyTypes: record.companyType,
      }
    : record;
  const limit =
    typeof source.limit === "number" && Number.isInteger(source.limit)
      ? Math.min(15, Math.max(1, source.limit))
      : 5;
  const seedSources = Array.isArray(source.seedSources)
    ? source.seedSources
        .filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as Record<string, unknown>).domain === "string",
        )
        .slice(0, 5)
        .map((entry) => ({
          domain: String(entry.domain).trim().toLowerCase(),
          mode: entry.mode === "fetch" ? ("fetch" as const) : ("search" as const),
          id:
            typeof entry.id === "string" && entry.id.trim()
              ? entry.id.trim()
              : undefined,
        }))
        .filter((entry) => entry.domain.length >= 3)
    : [];
  return {
    goal: typeof source.goal === "string" ? source.goal.trim() : "",
    industries: toList(source.industries),
    geographies: toList(source.geographies),
    companyTypes: toList(source.companyTypes),
    signals: toList(source.signals),
    exclusions: toList(source.exclusions),
    seedSources,
    limit,
  };
}

export function isDiscoveryCriteria(value: unknown): value is DiscoveryCriteria {
  return (
    typeof value === "object" &&
    value !== null &&
    "limit" in value &&
    "industries" in value
  );
}

/** Compact factual labels for badges and history rows. */
export function discoveryCriteriaLabels(
  criteria: DiscoveryCriteria,
): string[] {
  const labels: string[] = [];
  if (criteria.industries.length)
    labels.push(`Industry: ${criteria.industries.join(", ")}`);
  if (criteria.geographies.length)
    labels.push(`Geography: ${criteria.geographies.join(", ")}`);
  if (criteria.companyTypes.length)
    labels.push(`Type: ${criteria.companyTypes.join(", ")}`);
  if (criteria.signals.length)
    labels.push(`Signals: ${criteria.signals.join(", ")}`);
  if (criteria.seedSources.length)
    labels.push(`Seeds: ${criteria.seedSources.map((s) => s.domain).join(", ")}`);
  return labels;
}
