import {
  jobSchema,
  type JobStatus,
  type UpdateJobStatusInput,
} from "@surface/contracts";
import { apiClient } from "@/lib/api-client";

export async function updateJobStatus({
  id,
  status,
}: UpdateJobStatusInput & { id: string }) {
  const response = await apiClient<unknown>(`/api/jobs/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

  return jobSchema.parse(response);
}

export interface StatusChange {
  previousStatus?: JobStatus;
  id: string;
  status: JobStatus;
}
