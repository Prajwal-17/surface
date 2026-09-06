import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { analyzeJobs } from "../api/analyze-jobs";

export function useAnalyzeJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: analyzeJobs,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });

      if (result.analyzedCount === 0) {
        toast.info("Inbox analysis is current", {
          description: "There are no unscored inbox jobs.",
        });
        return;
      }

      const description = result.remainingCount
        ? `${result.remainingCount} unscored jobs remain.`
        : "Every inbox job has a fit score.";

      if (result.failedCount > 0) {
        toast.warning("Analysis partly completed", {
          description: `${result.analyzedCount} scored, ${result.failedCount} failed. ${description}`,
        });
      } else {
        toast.success(`${result.analyzedCount} jobs analyzed`, { description });
      }
    },
    onError: (error) => {
      toast.error("Could not analyze jobs", {
        description:
          error instanceof Error ? error.message : "Analysis could not run.",
      });
    },
  });
}
