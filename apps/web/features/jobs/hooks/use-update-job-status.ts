import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { updateJobStatus, type StatusChange } from "../api/update-job-status";

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StatusChange) => updateJobStatus(input),
    onSuccess: async (job) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      toast.success(
        job.status === "saved"
          ? "Saved to shortlist"
          : job.status === "dismissed"
            ? "Job dismissed"
            : "Returned to inbox",
        { description: job.title },
      );
    },
    onError: (error) => {
      toast.error("Could not update job", {
        description:
          error instanceof Error
            ? error.message
            : "The job could not be updated.",
      });
    },
  });
}
