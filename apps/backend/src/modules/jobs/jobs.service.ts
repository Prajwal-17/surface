import type { JobsListQuery, JobStatus } from "@repo/contracts";
import { NotFoundError } from "../../shared/errors/http-error";
import { findJobById, listJobs, setJobStatus } from "./jobs.repository";

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
