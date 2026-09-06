import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { runDiscovery } from "../api/run-discovery";

export function useRunDiscovery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runDiscovery,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });

      if (response.run.status === "failed") {
        toast.error("None of the job sources could be reached.");
        return;
      }

      const total = response.insertedCount + response.updatedCount;
      toast.success(
        total > 0
          ? `Search complete — ${total} jobs added or refreshed.`
          : "Search complete — no matching jobs this time.",
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "The search could not run.",
      );
    },
  });
}
