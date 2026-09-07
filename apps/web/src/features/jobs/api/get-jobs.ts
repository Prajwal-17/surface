import { jobsListResponseSchema, type JobsListQuery } from "backend/contracts";
import { apiClient } from "@/lib/api-client";

export async function getJobs(input: JobsListQuery) {
  const parameters = new URLSearchParams(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );

  const response = await apiClient<unknown>(
    `/api/jobs?${parameters.toString()}`,
  );
  return jobsListResponseSchema.parse(response);
}
