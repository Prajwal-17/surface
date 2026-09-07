import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { jobSchema, type Job } from "backend/contracts";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { AiLoadingState } from "@/components/ai/loading-state";
import { StreamingText } from "@/components/ai/streaming-text";

export function JobAssessment({ job }: { job: Job }) {
  const client = useQueryClient();
  const running = useIsMutating({ mutationKey: ["assess-job", job.id] });
  const assess = useMutation({
    mutationKey: ["assess-job", job.id],
    mutationFn: async () =>
      jobSchema.parse(
        await apiClient(`/api/jobs/${job.id}/assess`, { method: "POST" }),
      ),
    onSuccess: (updated) => {
      client.setQueryData(["jobs", "detail", updated.id], updated);
      void client.invalidateQueries({ queryKey: ["jobs", "list"] });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["analysis-settings"] });
      void client.invalidateQueries({ queryKey: ["jobs", "detail", job.id] });
    },
  });
  const pending =
    running > 0 || assess.isPending || job.assessmentState === "running";
  const summary = job.assessment?.output.summary ?? job.fit?.summary;
  return (
    <section
      aria-label="Job assessment"
      className="mb-3 space-y-2 text-sm leading-6"
    >
      {job.assessmentState !== "current" && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2.5"
          disabled={pending}
          onClick={() => assess.mutate()}
        >
          {pending
            ? "Assessing…"
            : summary
              ? "Update assessment"
              : "Assess this job"}
        </Button>
      )}
      <div aria-live="polite">
        {pending && <AiLoadingState label="Comparing with your profile" />}
        {summary && <StreamingText text={summary} />}
        {summary && job.assessmentState !== "current" && (
          <p className="text-muted-foreground">
            This result is from an earlier version of the job or your profile.
          </p>
        )}
        {job.assessmentState === "failed" && !pending && (
          <p>Assessment failed. Click the button to try again.</p>
        )}
      </div>
      {assess.error && <p role="alert">{assess.error.message}</p>}
    </section>
  );
}
