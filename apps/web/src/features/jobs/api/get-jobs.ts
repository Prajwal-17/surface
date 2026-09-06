import { jobsListResponseSchema, type JobsListQuery } from "backend/contracts";
import { apiClient } from "@/lib/api-client";

export async function getJobs(input: JobsListQuery) {
  const parameters = new URLSearchParams({
    status: input.status,
    search: input.search,
    page: String(input.page),
    limit: String(input.limit),
  });

  if (input.source) parameters.set("source", input.source);

  const response = await apiClient<unknown>(
    `/api/jobs?${parameters.toString()}`,
  );
  return jobsListResponseSchema.parse(response);
}
