import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sanitizeHtml from "sanitize-html";
import { eq, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { env } from "../../config/env";
import { companies } from "../workspace/workspace.tables";
import { fetchPublic } from "../collection/public-http";
import { readCompanyPage } from "./evidence";
import { getCompany } from "./repository";
import { pageEvidence, type DiscoveryPage } from "./sources";
import { contactsFromPage, saveContact, contactPriority } from "./contacts";
export const logoDirectory = join(env.DATA_DIR, "company-logos");
export async function cacheLogo(url: string, fetcher = fetchPublic) {
  const p = await fetcher(url),
    raw = p.rawBytes ?? Buffer.from(p.body);
  if (raw.byteLength > 2 * 1024 * 1024)
    throw new Error("Company image exceeds 2 MiB.");
  let ext: string,
    bytes: Uint8Array = raw;
  const b = Buffer.from(raw);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    ext = "png";
  else if (b[0] === 255 && b[1] === 216 && b[2] === 255) ext = "jpg";
  else if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    ext = "webp";
  else if (b.toString("ascii", 0, 3) === "GIF") ext = "gif";
  else if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) ext = "ico";
  else if (p.mediaType === "image/svg+xml" && /<svg[\s>]/i.test(p.body)) {
    ext = "svg";
    bytes = Buffer.from(
      sanitizeHtml(p.body, {
        allowedTags: [
          "svg",
          "g",
          "path",
          "rect",
          "circle",
          "ellipse",
          "line",
          "polyline",
          "polygon",
          "defs",
          "linearGradient",
          "radialGradient",
          "stop",
          "clipPath",
          "mask",
          "title",
        ],
        allowedAttributes: {
          "*": [
            "xmlns",
            "viewBox",
            "viewbox",
            "width",
            "height",
            "fill",
            "stroke",
            "stroke-width",
            "d",
            "x",
            "y",
            "x1",
            "x2",
            "y1",
            "y2",
            "cx",
            "cy",
            "r",
            "rx",
            "ry",
            "points",
            "transform",
            "opacity",
            "offset",
            "stop-color",
            "id",
            "clip-path",
            "fill-rule",
            "clip-rule",
          ],
        },
        parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
      }),
    );
  } else throw new Error("Company image is not a supported image.");
  const file = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
  await mkdir(logoDirectory, { recursive: true });
  await writeFile(join(logoDirectory, file), bytes, { mode: 0o600 });
  return `/api/company-discovery/logos/${file}`;
}
export async function enrichCompany(
  id: string,
  level: "light" | "full" | "contacts",
  seed?: DiscoveryPage,
  reader = readCompanyPage,
  logo = cacheLogo,
) {
  const company = await getCompany(id);
  if (company.archived)
    return { contacts: 0, pages: 0, errors: ["Company archived."] };
  const pages: DiscoveryPage[] = [],
    errors: string[] = [];
  try {
    pages.push(await reader(company.website, false, level !== "light"));
  } catch (e) {
    errors.push(`Website: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (seed && !pages.some((p) => p.url === seed.url)) pages.push(seed);
  if (level !== "light" && pages.length) {
    const candidates = pages
      .flatMap((p) => p.links)
      .filter((l) => {
        try {
          return (
            new URL(l.url).hostname.replace(/^www\./, "") ===
              new URL(company.website).hostname.replace(/^www\./, "") &&
            /team|about|contact|careers|jobs|people|leadership/i.test(
              l.url + " " + l.title,
            )
          );
        } catch {
          return false;
        }
      })
      .toSorted(
        (a, b) =>
          (/team|contact|about/i.test(a.url) ? 0 : 1) -
          (/team|contact|about/i.test(b.url) ? 0 : 1),
      );
    for (const url of [...new Set(candidates.map((l) => l.url))].slice(0, 4))
      if (!pages.some((p) => p.url === url))
        try {
          pages.push(await reader(url, false, true));
        } catch (e) {
          errors.push(
            `${new URL(url).pathname}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
  }
  let count = 0;
  const contactPages = pages.filter(
    (page) =>
      new URL(page.url).hostname.replace(/^www\./, "") ===
        new URL(company.website).hostname.replace(/^www\./, "") ||
      Boolean(page.metadata.directoryCompany),
  );
  const seenContacts = new Set<string>();
  const candidates = contactPages
    .flatMap(contactsFromPage)
    .toSorted((a, b) => contactPriority(a.role) - contactPriority(b.role));
  for (const contact of candidates) {
    const identity =
      contact.name.toLowerCase() || contact.methods[0]?.value || contact.role;
    if (seenContacts.has(identity)) continue;
    seenContacts.add(identity);
    if (count >= 8) break;
    try {
      await saveContact(id, contact);
      count++;
    } catch (e) {
      errors.push(`Contact: ${String(e)}`);
    }
  }
  const official = pages.filter(
    (p) =>
      new URL(p.url).hostname.replace(/^www\./, "") ===
      new URL(company.website).hostname.replace(/^www\./, ""),
  );
  const images = [
    ...official.flatMap((p) => p.metadata.images),
    ...pages
      .filter((p) => p.metadata.directoryCompany)
      .flatMap((p) =>
        p.metadata.images.filter((i) => i.source === "YC company profile"),
      ),
  ].toSorted(
    (a, b) => (a.kind === "logo" ? 0 : 1) - (b.kind === "logo" ? 0 : 1),
  );
  if (!images.some((i) => i.kind === "favicon"))
    images.push({
      url: new URL("/favicon.ico", company.website).href,
      kind: "favicon",
      source: "website favicon",
    });
  let selected: Partial<typeof companies.$inferInsert> = {};
  if (level !== "contacts") {
    for (const image of images.slice(0, 12))
      try {
        if (
          company.logoPath &&
          company.logoKind === "logo" &&
          image.kind === "favicon"
        )
          continue;
        selected = {
          logoPath: await logo(image.url),
          logoSourceUrl: image.url,
          logoKind: image.kind,
          logoFetchedAt: new Date().toISOString(),
        };
        break;
      } catch {
        /* Continue through logo → favicon; previous asset remains on failure. */
      }
    if (!selected.logoPath)
      errors.push("Logo refresh failed; previous image retained.");
  }
  const now = new Date().toISOString();
  const evidence = [...company.enrichmentEvidence];
  for (const p of pages) {
    const e = pageEvidence(p),
      i = evidence.findIndex((x) => x.url === e.url);
    if (i < 0) evidence.push(e);
    else evidence[i] = e;
  }
  await db
    .update(companies)
    .set({
      ...selected,
      ...(!company.description && official[0]?.metadata.description
        ? {
            description: sql`CASE WHEN ${companies.description}='' THEN ${official[0].metadata.description} ELSE ${companies.description} END`,
          }
        : {}),
      enrichmentEvidence: evidence.slice(-20),
      ...(pages.length
        ? {
            enrichedAt: now,
            contactsCheckedAt: now,
            ...(level === "full" && official.length
              ? { detailsCheckedAt: now }
              : {}),
          }
        : {}),
      enrichmentError: errors.length ? errors.join("\n").slice(0, 6000) : null,
      updatedAt: now,
    })
    .where(eq(companies.id, id));
  return { contacts: count, pages: pages.length, errors };
}
