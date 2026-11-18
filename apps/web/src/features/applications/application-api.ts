import {
  applicationSchema,
  type ApplicationStatus,
  type CreateApplication,
  type UpdateApplication,
} from "@surface/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

export const applicationLabels: Record<ApplicationStatus, string> = {
  queued: "In queue",
  applied: "Applied",
  contacted: "Contacted",
  in_conversation: "In conversation",
  closed: "Closed",
  ignored: "Ignored",
};

export const applicationKeys = ["applications"] as const;

export function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export async function getApplications() {
  return applicationSchema.array().parse(await apiClient("/api/applications"));
}

export function useSaveApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { id: string; fields: UpdateApplication }
        | { fields: CreateApplication },
    ) => {
      const id = "id" in input ? input.id : undefined;
      return applicationSchema.parse(
        await apiClient(
          id
            ? `/api/applications/${encodeURIComponent(id)}`
            : "/api/applications",
          { method: id ? "PATCH" : "POST", body: JSON.stringify(input.fields) },
        ),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationKeys }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
}

export function jobApplicationKey(id: string) {
  return [...applicationKeys, "job", id] as const;
}

export async function getJobApplication(id: string) {
  return applicationSchema
    .nullable()
    .parse(await apiClient(`/api/jobs/${encodeURIComponent(id)}/application`));
}

export function useTrackJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "queued" | "applied" | "ignored";
    }) =>
      applicationSchema.parse(
        await apiClient(`/api/jobs/${encodeURIComponent(id)}/application`, {
          method: "PUT",
          body: JSON.stringify({
            status,
            appliedOn: status === "applied" ? localDate() : undefined,
          }),
        }),
      ),
    onSuccess: async (row, { id }) => {
      client.setQueryData(jobApplicationKey(id), row);
      toast.success(applicationLabels[row.status], { description: row.title });
      await Promise.all([
        client.invalidateQueries({ queryKey: applicationKeys }),
        client.invalidateQueries({ queryKey: ["jobs"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
}
