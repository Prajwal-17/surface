import {
  jobPreferencesResponseSchema,
  type JobPreferencesInput,
} from "backend/contracts";
import { apiClient } from "@/lib/api-client";

export async function getJobPreferences() {
  const response = await apiClient<unknown>("/api/profile");
  return jobPreferencesResponseSchema.parse(response).preferences;
}

export async function updateJobPreferences(input: JobPreferencesInput) {
  const response = await apiClient<unknown>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });

  return jobPreferencesResponseSchema.parse(response).preferences;
}
