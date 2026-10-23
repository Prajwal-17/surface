import type { JobsListQuery, JobStatus } from "@surface/contracts";
import { HttpError } from "../../shared/errors/http-error";
import { findJobById, listJobs, setJobStatus } from "./jobs.repository";

export async function getJobs(input: JobsListQuery) {
  return await listJobs(input);
}

export async function getJob(id: string) {
  const job = await findJobById(id);
  if (!job) throw new HttpError(404, "Job not found.");
  return job;
}

export async function updateJobStatus(id: string, status: JobStatus) {
  const job = await setJobStatus(id, status);
  if (!job) throw new HttpError(404, "Job not found.");
  return job;
}
