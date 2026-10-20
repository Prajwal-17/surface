import { country } from "../analysis/eligibility";
import { parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";
import {
  asRecord as object,
  asArray as array,
} from "../discovery/sources/source-adapter";
import {
  toIsoDate,
  toStringValue as str,
  type JobCandidate,
} from "../../shared/normalization/job-normalization";
import type {
  Compensation,
  ConfiguredSource,
  FieldEvidence,
} from "@surface/contracts";
export function descriptionContent(raw: string): {
  description: string;
  descriptionHtml: string;
} {
  // ATS descriptions can be HTML-entity encoded. Parse inertly, never execute scripts.
  let value = raw;
  for (let pass = 0; pass < 2 && /&(?:lt|amp);/i.test(value); pass++) {
    const { document } = parseHTML(
      `<html><body><div>${value.replaceAll("<", "&lt;")}</div></body></html>`,
    );
    value = document.querySelector("div")?.textContent ?? value;
  }

  const html = sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "ul",
      "ol",
      "li",
      "strong",
      "b",
      "em",
      "i",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "a",
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: { ...attrs, target: "_blank", rel: "noreferrer noopener" },
      }),
    },
  });
  const { document } = parseHTML(
    `<html><body>${html.replace(/<(?:br)\s*\/?>/gi, "\n").replace(/<\/(?:p|li|ul|ol|h[234]|blockquote)>/gi, "$&\n\n")}</body></html>`,
  );
  return {
    descriptionHtml: html,
    description: document.body.textContent
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}
export function workMode(value: unknown): JobCandidate["workMode"] {
  const v = str(value).toLowerCase().replace(/[-_ ]/g, "");
  return ["remote", "hybrid", "onsite"].includes(v)
    ? (v as "remote" | "hybrid" | "onsite")
    : "unknown";
}
export function employment(value: unknown): string | null {
  const v = str(value).toLowerCase().replace(/[-_ ]/g, "");
  return (
    (
      {
        fulltime: "full-time",
        parttime: "part-time",
        contract: "contract",
        contractor: "contract",
        intern: "internship",
        internship: "internship",
        temporary: "temporary",
      } as Record<string, string>
    )[v] ??
    (str(value) || null)
  );
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
export function salary(value: unknown): Compensation | null {
  const obj = object(value);
  if (
    !Object.values(obj).some(
      (entry) => entry !== undefined && entry !== null && entry !== "",
    )
  )
    return null;
  const amount = object(obj.value);
  const period = str(amount.unitText || obj.interval)
    .toLowerCase()
    .replace(/^1 /, "");
  return {
    min: number(amount.minValue ?? amount.value ?? obj.min ?? obj.minValue),
    max: number(amount.maxValue ?? amount.value ?? obj.max ?? obj.maxValue),
    currency: str(obj.currency || obj.currencyCode).toUpperCase() || null,
    period:
      (
        {
          year: "year",
          yearly: "year",
          annual: "year",
          month: "month",
          monthly: "month",
          hour: "hour",
          hourly: "hour",
        } as const
      )[period as "year"] ?? null,
    original: JSON.stringify(value),
  };
}
export function extractAts(
  source: ConfiguredSource,
  payload: unknown,
  companyName?: string,
): JobCandidate[] {
  const root = object(payload);
  const single = root.id !== undefined && (root.absolute_url || root.hostedUrl);
  const values = single
    ? [root]
    : source.provider === "lever"
      ? payload
      : root.jobs;
  if (!Array.isArray(values))
    throw new Error("Malformed ATS response: expected a jobs array.");
  return values.flatMap((raw) => {
    const item = object(raw);
    if (
      item.isListed === false ||
      (source.provider === "greenhouse" && item.internal_job_id === null)
    )
      return [];
    const categories = object(item.categories);
    const title = str(item.title || item.text);
    const applyUrl = str(
      item.absolute_url || item.hostedUrl || item.jobUrl || item.applyUrl,
    );
    if (
      !title ||
      !URL.canParse(applyUrl) ||
      !["http:", "https:"].includes(new URL(applyUrl).protocol)
    )
      throw new Error(
        "Incomplete ATS inventory: a posting is missing a title or public URL.",
      );
    const rawDescription =
      str(item.content || item.descriptionHtml || item.description) +
      array(item.lists)
        .map((v) => {
          const list = object(v);
          return `<h3>${sanitizeHtml(str(list.text), { allowedTags: [], allowedAttributes: {} })}</h3>${str(list.content)}`;
        })
        .join("") +
      str(item.additional);
    const mode = workMode(
      item.workplaceType ?? (item.isRemote === true ? "remote" : ""),
    );
    let compensation =
      source.provider === "ashby"
        ? salary(
            array(object(item.compensation).summaryComponents).find(
              (v) => object(v).compensationType === "Salary",
            ),
          )
        : salary(item.salaryRange);
    if (
      source.provider === "greenhouse" &&
      array(item.pay_input_ranges).length
    ) {
      const ranges = array(item.pay_input_ranges),
        range = object(ranges[0]);
      compensation = {
        min:
          ranges.length === 1 && typeof range.min_cents === "number"
            ? range.min_cents / 100
            : null,
        max:
          ranges.length === 1 && typeof range.max_cents === "number"
            ? range.max_cents / 100
            : null,
        currency: ranges.length === 1 ? str(range.currency_type) || null : null,
        period: null,
        original: JSON.stringify(ranges),
      };
    }
    const location = str(
      object(item.location).name || item.location || categories.location,
      "Location not listed",
    );
    const evidence: FieldEvidence[] = Object.entries(item)
      .filter(([key]) =>
        [
          "title",
          "text",
          "location",
          "categories",
          "employmentType",
          "workplaceType",
          "compensation",
          "salaryRange",
          "publishedAt",
          "first_published",
          "company_name",
        ].includes(key),
      )
      .map(([field, value]) => ({
        field,
        value: typeof value === "string" ? value : JSON.stringify(value),
        reference: `$.jobs[${str(item.id, applyUrl)}].${field}`,
      }));
    const content = descriptionContent(
      rawDescription || str(item.descriptionPlain),
    );
    return [
      {
        source: source.provider as JobCandidate["source"],
        boardIdentity: source.boardIdentity,
        configuredSourceId: source.id,
        companyId: source.companyId,
        externalId: str(item.id) || applyUrl,
        title,
        company: str(item.company_name || companyName, "Company not listed"),
        location,
        isRemote: mode === "remote",
        workMode: mode,
        employmentType: employment(
          item.employmentType || categories.commitment,
        ),
        ...content,
        applyUrl,
        sourceUrl: applyUrl,
        postedAt: toIsoDate(
          item.publishedAt || item.first_published || item.createdAt,
        ),
        tags: [],
        compensation,
        countries: [],
        evidence,
        method: `${source.provider}-api`,
        incomplete:
          !content.description || (!companyName && !item.company_name),
      },
    ];
  });
}
function findJobPosting(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 15) return [];
  if (Array.isArray(value))
    return value.flatMap((v) => findJobPosting(v, depth + 1));
  const item = object(value),
    type = item["@type"];
  if (
    type === "JobPosting" ||
    (Array.isArray(type) && type.includes("JobPosting"))
  )
    return [item];
  return Object.values(item).flatMap((v) =>
    typeof v === "object" ? findJobPosting(v, depth + 1) : [],
  );
}
export function extractPage(
  source: ConfiguredSource,
  html: string,
): JobCandidate[] {
  const { document } = parseHTML(html);
  let entries: Record<string, unknown>[] = [];
  let method = "json-ld";
  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      entries.push(...findJobPosting(JSON.parse(script.textContent)));
    } catch {
      /* A malformed block does not invalidate a separate valid block. */
    }
  }
  if (!entries.length) {
    method = "embedded-job-data";
    for (const script of document.querySelectorAll(
      'script#__NEXT_DATA__,script[type="application/json"]',
    )) {
      try {
        entries.push(...findJobPosting(JSON.parse(script.textContent)));
      } catch {
        /* Only explicit JobPosting objects are accepted. */
      }
    }
  }
  if (!entries.length) {
    method = "jobposting-microdata";
    for (const node of document.querySelectorAll(
      '[itemtype="https://schema.org/JobPosting"],[itemtype="http://schema.org/JobPosting"]',
    )) {
      const field = (name: string) => {
        const el = node.querySelector(`[itemprop="${name}"]`);
        return (
          el?.getAttribute("content") ||
          el?.getAttribute("datetime") ||
          el?.textContent ||
          ""
        );
      };
      entries.push({
        "@type": "JobPosting",
        title: field("title"),
        description: node.querySelector('[itemprop="description"]')?.innerHTML,
        hiringOrganization: { name: field("hiringOrganization") },
        datePosted: field("datePosted"),
        employmentType: field("employmentType"),
      });
    }
  }
  if (!entries.length)
    throw new Error(
      document.querySelector('input[type="password"]')
        ? "Unsupported: this page requires login."
        : "Unsupported: no explicit job data found. This may be a JavaScript-only page or a non-posting URL.",
    );
  // A directly supplied page must represent one job, not a search inventory.
  if (entries.length !== 1)
    throw new Error(
      "Unsupported: this URL contains multiple postings. Supply individual public job URLs.",
    );
  return entries.map((item) => {
    const title = str(item.title),
      organization = object(item.hiringOrganization),
      company = str(organization.name, "Company not listed");
    if (!title)
      throw new Error("Incomplete extraction: the JobPosting has no title.");
    const place = object(
        Array.isArray(item.jobLocation)
          ? item.jobLocation[0]
          : item.jobLocation,
      ),
      address = object(place.address);
    const location =
      [
        str(address.addressLocality),
        str(address.addressRegion),
        str(address.addressCountry),
      ]
        .filter(Boolean)
        .join(", ") || "Location not listed";
    const remote = item.jobLocationType === "TELECOMMUTE";
    const content = descriptionContent(str(item.description));
    const requirements = item.applicantLocationRequirements
      ? Array.isArray(item.applicantLocationRequirements)
        ? item.applicantLocationRequirements
        : [item.applicantLocationRequirements]
      : [];
    const countries = requirements
      .filter((v) => object(v)["@type"] === "Country")
      .map((v) => str(object(v).name))
      .filter(Boolean);
    return {
      source: "public-page",
      configuredSourceId: source.id,
      companyId: source.companyId,
      externalId: source.url,
      title,
      company,
      location,
      isRemote: remote,
      workMode: remote ? "remote" : "unknown",
      employmentType: employment(item.employmentType),
      ...content,
      applyUrl: source.url,
      sourceUrl: source.url,
      postedAt: toIsoDate(item.datePosted),
      tags: [],
      countries,
      compensation: salary(item.baseSalary),
      evidence: Object.entries(item)
        .filter(([key]) => key !== "description")
        .map(([field, value]) => ({
          field,
          value: typeof value === "string" ? value : JSON.stringify(value),
          reference: `${method}.${field}`,
        })),
      method,
      incomplete:
        company === "Company not listed" || content.description.length < 80,
    };
  });
}

export function explicitCountries(raw: unknown): string[] {
  const value = str(raw);
  if (/^(worldwide|anywhere|global)$/i.test(value)) return ["*"];
  const values = value.split(/[,;]/).map(country);
  return values.length && values.every(Boolean) ? (values as string[]) : [];
}
