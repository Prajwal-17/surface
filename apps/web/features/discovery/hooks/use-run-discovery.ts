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
        toast.error("Search failed", {
          description: "None of the job sources could be reached.",
        });
        return;
      }

      const total = response.insertedCount + response.updatedCount;
      toast.success("Search complete", {
        description:
          total > 0
            ? `${total} jobs were added or refreshed.`
            : "No matching jobs were found this time.",
      });
    },
    onError: (error) => {
      toast.error("Search failed", {
        description:
          error instanceof Error ? error.message : "The search could not run.",
      });
    },
  });
}
