export function companyDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function normalizedName(name: string) {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function websiteIdentity(input: string) {
  const host = companyDomain(input);
  if (!host) return null;
  if (
    /(?:^|\.)(?:ycombinator\.com|techcrunch\.com|linkedin\.com|twitter\.com|x\.com|businesswire\.com|prnewswire\.com|venturebeat\.com|finsmes\.com)$/.test(
      host,
    )
  )
    return null;
  return host;
}
export function canonicalUrl(input: string) {
  const u = new URL(input);
  u.hash = "";
  const keys = Array.from(u.searchParams.keys());
  for (const key of keys)
    if (/^utm_|^(fbclid|gclid)$/.test(key)) u.searchParams.delete(key);
  return u.href;
}
export function nextDailyRun(
  timeOfDay: string,
  timezone: string,
  after = new Date(),
) {
  const [hour, minute] = timeOfDay.split(":").map(Number);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  // Minute stepping handles timezone offsets and DST gaps/overlaps without local-server assumptions.
  let t = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  for (let i = 0; i < 60 * 49; i++, t += 60000) {
    const p = Object.fromEntries(
      formatter.formatToParts(t).map((part) => [part.type, part.value]),
    );
    if (Number(p.hour) === hour && Number(p.minute) === minute)
      return new Date(t).toISOString();
  }
  throw new Error("Could not schedule the selected local time.");
}
export function evidenceDate(input: unknown): string | null {
  if (
    typeof input !== "string" ||
    !input.trim() ||
    !/(?:\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i.test(
      input,
    )
  )
    return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
export function queueFor(
  company: { reviewState: string; deferredUntil: string | null },
  now = new Date(),
) {
  return company.deferredUntil && company.deferredUntil > now.toISOString()
    ? "later"
    : company.reviewState;
}
