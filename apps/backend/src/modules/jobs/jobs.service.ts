import type { JobsListQuery, JobStatus } from "../../shared/contracts";
import { HttpError, NotFoundError } from "../../shared/errors/http-error";
import { getJobPreferences } from "../profile";
import {
  analyzeJobFit,
  ensureOmniRouteConfigured,
} from "./job-fit-analyzer";
import {
  countJobsForAnalysis,
  findJobById,
  listJobs,
  listJobsForAnalysis,
  saveJobFit,
  setJobStatus,
} from "./jobs.repository";

const analysisBatchSize = 10;

export function getJobs(input: JobsListQuery) {
  return listJobs(input);
}

export function getJob(id: string) {
  const job = findJobById(id);
  if (!job) throw new NotFoundError("Job not found.");
  return job;
}

export function updateJobStatus(id: string, status: JobStatus) {
  const job = setJobStatus(id, status);
  if (!job) throw new NotFoundError("Job not found.");
  return job;
}

export async function analyzeInboxJobs() {
  const preferences = getJobPreferences();
  if (!preferences) {
    throw new HttpError(409, "Set your job preferences before analyzing jobs.");
  }

  ensureOmniRouteConfigured();

  const jobs = listJobsForAnalysis(analysisBatchSize);
  if (jobs.length === 0) {
    return { analyzedCount: 0, failedCount: 0, remainingCount: 0 };
  }

  const results = await Promise.allSettled(
    jobs.map(async (job) => ({
      id: job.id,
      fit: await analyzeJobFit(preferences, job),
    })),
  );

  let analyzedCount = 0;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    saveJobFit(result.value.id, result.value.fit);
    analyzedCount += 1;
  }

  const failedCount = results.length - analyzedCount;
  if (analyzedCount === 0) {
    throw new HttpError(502, "OmniRoute could not analyze any jobs.");
  }

  return {
    analyzedCount,
    failedCount,
    remainingCount: countJobsForAnalysis(),
  };
}
