import type { JobPreferencesInput } from "backend/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import {
  getJobPreferences,
  updateJobPreferences,
} from "../api/job-preferences";

export function useJobPreferences() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: getJobPreferences,
  });
}

export function useUpdateJobPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: JobPreferencesInput) => updateJobPreferences(input),
    onSuccess: async (preferences) => {
      queryClient.setQueryData(queryKeys.profile, preferences);
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      toast.success("Preferences saved", {
        description: "Existing fit scores were cleared for a fresh analysis.",
      });
    },
    onError: (error) => {
      toast.error("Could not save preferences", {
        description:
          error instanceof Error
            ? error.message
            : "Your preferences could not be saved.",
      });
    },
  });
}
