import { analyzeJobsResponseSchema } from "backend/contracts";
import { apiClient } from "@/lib/api-client";

export async function analyzeJobs() {
  const response = await apiClient<unknown>("/api/jobs/analyze", {
    method: "POST",
  });

  return analyzeJobsResponseSchema.parse(response);
}
