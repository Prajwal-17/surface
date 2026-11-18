import {
  jobFindResultSchema,
  sourceLabels,
  type JobFindInput,
  type JobFindResult,
  type SourceKey,
} from "@surface/contracts";
import { sourceAdapters } from "../discovery/sources";
import type { SourceAdapter } from "../discovery/sources/source-adapter";
import { fetchPublic } from "../collection/public-http";
import {
  normalizeCandidate,
  type JobCandidate,
} from "../../shared/normalization/job-normalization";
import { upsertCandidates } from "./jobs.repository";

interface Portal {
  key: SourceKey;
  label: string;
  url: string;
}

/** The fixed set of public job portals Surface searches. */
export const JOB_PORTALS: Portal[] = [
  {
    key: "remotive",
    label: sourceLabels.remotive,
    url: "https://remotive.com/api/remote-jobs",
  },
  {
    key: "jobicy",
    label: sourceLabels.jobicy,
    url: "https://jobicy.com/api/v2/remote-jobs",
  },
  {
    key: "arbeitnow",
    label: sourceLabels.arbeitnow,
    url: "https://www.arbeitnow.com/api/job-board-api",
  },
  {
    key: "remote-ok",
    label: sourceLabels["remote-ok"],
    url: "https://remoteok.com/api",
  },
  {
    key: "we-work-remotely",
    label: sourceLabels["we-work-remotely"],
    url: "https://weworkremotely.com/remote-jobs.rss",
  },
];

const MAX_RESULTS = 500;

function adapterFor(key: SourceKey): SourceAdapter {
  const adapter = sourceAdapters.find((candidate) => candidate.key === key);
  if (!adapter) throw new Error(`No adapter for ${key}.`);
  return adapter;
}

function searchText(candidate: JobCandidate) {
  return [
    candidate.title,
    candidate.company,
    candidate.location,
    candidate.employmentType ?? "",
    candidate.tags.join(" "),
    candidate.description,
  ]
    .join(" ")
    .toLowerCase();
}

function matches(candidate: JobCandidate, input: JobFindInput) {
  const text = searchText(candidate);
  const terms = input.query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length && !terms.every((term) => text.includes(term)))
    return false;
  if (input.location) {
    const location = input.location.toLowerCase();
    return (
      candidate.isRemote ||
      candidate.location.toLowerCase().includes(location) ||
      candidate.countries?.some((country) =>
        country.toLowerCase().includes(location),
      )
    );
  }
  return true;
}

function byNewest(a: JobCandidate, b: JobCandidate) {
  return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
}

async function searchPortal(portal: Portal, input: JobFindInput) {
  const payload = await fetchPublic(portal.url);
  const raw =
    portal.key === "we-work-remotely" ? payload.body : JSON.parse(payload.body);
  const jobs = adapterFor(portal.key)
    .extract(raw)
    .jobs.map((job) => normalizeCandidate({ ...job, method: `${portal.key}-search` }))
    .filter((job) => matches(job, input))
    .toSorted(byNewest);
  return jobs;
}

export async function findJobs(input: JobFindInput): Promise<JobFindResult> {
  const settled = await Promise.allSettled(
    JOB_PORTALS.map((portal) => searchPortal(portal, input)),
  );
  const candidates: JobCandidate[] = [];
  const portals = settled.map((result, index) => {
    const portal = JOB_PORTALS[index]!;
    if (result.status === "rejected") {
      return {
        key: portal.key,
        label: portal.label,
        found: 0,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Could not read this portal.",
      };
    }
    const jobs = result.value.slice(0, 120);
    candidates.push(...jobs);
    return {
      key: portal.key,
      label: portal.label,
      found: jobs.length,
      error: null,
    };
  });

  const selected = candidates.toSorted(byNewest).slice(0, MAX_RESULTS);
  const counts = selected.length
    ? await upsertCandidates(selected)
    : { insertedCount: 0, updatedCount: 0 };

  return jobFindResultSchema.parse({
    found: selected.length,
    inserted: counts.insertedCount,
    updated: counts.updatedCount,
    portals,
  });
}
