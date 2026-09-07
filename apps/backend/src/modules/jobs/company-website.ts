import type { FieldEvidence } from "../../shared/contracts";

function website(value: unknown, homepageOnly = false): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(
      value
        .trim()
        .replace(/[.,;]+$/, "")
        .replace(/^www\./i, "https://www."),
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    if (
      homepageOnly &&
      (url.pathname !== "/" ||
        url.search ||
        url.hash ||
        /^(?:careers?|jobs|boards|apply)\./i.test(url.hostname))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function companyWebsite(
  configured: string | undefined,
  evidence: FieldEvidence[],
  description: string,
) {
  const known = website(configured);
  if (known) return known;
  for (const field of evidence) {
    if (field.field !== "hiringOrganization") continue;
    try {
      const organization = JSON.parse(field.value);
      const url =
        website(organization.url, true) ?? website(organization.sameAs, true);
      if (url) return url;
    } catch {
      /* Malformed source evidence does not establish a company website. */
    }
  }
  // Only explicitly labeled homepages; never guess from the company name or application URL.
  const match =
    /(?:\bcompany\s+(?:website|url)|\bwebsite|\bURL|\bfor more information,?\s+visit)\s*:?\s*((?:https?:\/\/|www\.)[^\s<>"()]+)/i.exec(
      description,
    );
  return website(match?.[1], true);
}
