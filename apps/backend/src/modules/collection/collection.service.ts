import type { ConfiguredSource } from "../../shared/contracts";
import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { companies } from "../workspace/workspace.tables";
import { sourceAdapters } from "../discovery/sources";
import {
  normalizeCandidate,
  type JobCandidate,
} from "../../shared/normalization/job-normalization";
import { extractAts, extractPage } from "./extraction";
import { fetchPublic, type FetchedPayload } from "./public-http";
import { persistSnapshot } from "./snapshots";
export interface CollectionResult {
  candidates: JobCandidate[];
  complete: boolean;
  error: string | null;
}
export async function collectSource(
  source: ConfiguredSource,
  fetcher: (url: string) => Promise<FetchedPayload> = fetchPublic,
  snapshotter = persistSnapshot,
): Promise<CollectionResult> {
  if (source.support === "unsupported") throw new Error(source.reason);
  const company = source.companyId
    ? db
        .select()
        .from(companies)
        .where(eq(companies.id, source.companyId))
        .get()
    : undefined;
  const candidates: JobCandidate[] = [];
  const seen = new Set<string>();
  const singlePosting =
    (source.provider === "lever" &&
      new URL(source.endpoint).pathname.split("/").filter(Boolean).length ===
        4) ||
    (source.provider === "greenhouse" &&
      new URL(source.endpoint).pathname.split("/").filter(Boolean).length ===
        5);
  let url = source.endpoint;
  let bytesFetched = 0;
  // ponytail: bounded 100-page inventory; larger boards are explicitly partial, never closed from this run.
  for (let page = 0; page < 100; page++) {
    try {
      if (source.provider === "lever" && !singlePosting) {
        const u = new URL(source.endpoint);
        u.searchParams.set("mode", "json");
        u.searchParams.set("limit", "100");
        u.searchParams.set("skip", String(page * 100));
        url = u.href;
      }
      if (seen.has(url))
        return {
          candidates,
          complete: false,
          error: "Repeated pagination URL.",
        };
      seen.add(url);
      const payload = await fetcher(url);
      const snapshot = snapshotter(payload);
      bytesFetched +=
        payload.rawBytes?.byteLength ?? Buffer.byteLength(payload.body);
      if (bytesFetched > 64 * 1024 * 1024)
        return {
          candidates,
          complete: false,
          error: "Inventory exceeds the 64 MiB collection limit.",
        };
      let jobs: JobCandidate[];
      let complete = false;
      let next: string | null = null;
      if (source.provider === "public-page") {
        jobs = extractPage(source, payload.body);
      } else {
        const raw =
          source.provider === "we-work-remotely"
            ? payload.body
            : JSON.parse(payload.body);
        if (["greenhouse", "lever", "ashby"].includes(source.provider)) {
          jobs = extractAts(source, raw, company?.name);
          complete = singlePosting
            ? false
            : source.provider === "lever"
              ? raw.length < 100
              : source.provider === "greenhouse"
                ? typeof raw.meta?.total === "number" &&
                  raw.meta.total === raw.jobs.length
                : true;
          if (source.provider === "lever" && !singlePosting && !complete)
            next = source.endpoint;
        } else {
          const adapter = sourceAdapters.find((a) => a.key === source.provider);
          if (!adapter)
            throw new Error("No extraction adapter for this source.");
          jobs = adapter.extract(raw).jobs.map((job) => ({
            ...job,
            configuredSourceId: source.id,
            method: `${source.provider}-feed`,
            evidence: [
              {
                field: "posting",
                value: job.title,
                reference: job.externalId ?? job.sourceUrl,
              },
            ],
            incomplete: !job.description,
          }));
          // Feeds/search APIs are not authoritative complete inventories.
          if (source.provider === "arbeitnow" && raw.links?.next) {
            const target = new URL(raw.links.next, source.endpoint),
              base = new URL(source.endpoint);
            if (
              target.origin !== base.origin ||
              target.pathname !== base.pathname ||
              [...target.searchParams.keys()].some((k) => k !== "page")
            )
              throw new Error("Invalid provider pagination link.");
            next = target.href;
          }
        }
      }
      candidates.push(
        ...jobs.map((job) => normalizeCandidate({ ...job, ...snapshot })),
      );
      if (!next)
        return {
          candidates,
          complete: complete && !jobs.some((j) => j.incomplete),
          error: jobs.some((j) => j.incomplete)
            ? "Some postings have incomplete extracted fields; review source evidence."
            : null,
        };
      url = next;
    } catch (error) {
      if (!candidates.length) throw error;
      return {
        candidates,
        complete: false,
        error:
          error instanceof Error
            ? error.message
            : "Partial collection failure.",
      };
    }
  }
  return {
    candidates,
    complete: false,
    error: "Pagination safety limit reached.",
  };
}
