import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { researchDetailSchema } from "@surface/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ResearchMarkdown } from "@/features/research/research-markdown";
import { displayDate } from "../company-ui";

export function CompanySummary({ companyId }: { companyId: string }) {
  const client = useQueryClient();
  const queryKey = ["company-research", companyId];
  const research = useQuery({
    queryKey,
    queryFn: async () =>
      researchDetailSchema.parse(
        await apiClient(`/api/companies/${companyId}/research`),
      ),
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => r.state === "running") ? 2000 : false,
  });
  const generate = useMutation({
    mutationFn: () =>
      apiClient(`/api/companies/${companyId}/research/summary`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey });
    },
  });
  const data = research.data;
  const runs = data?.runs.filter((r) => r.kind === "summary") ?? [];
  const latest = runs[0];
  const saved = runs.flatMap((r) => {
    const message = data?.messages.find((m) => m.runId === r.id && m.answer);
    return message ? [message] : [];
  })[0];
  const active = data?.runs.find((r) => r.state === "running");
  const busy = generate.isPending || Boolean(active);
  const error =
    generate.error?.message || research.error?.message || latest?.error;
  return (
    <section
      className="company-reader-section"
      aria-labelledby="company-summary-title"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="company-summary-title">AI summary</h3>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || research.isPending || Boolean(research.error)}
          onClick={() => generate.mutate()}
        >
          {busy && <LoaderCircle className="animate-spin" />}
          {busy
            ? active && active.kind !== "summary"
              ? "Research in progress…"
              : "Generating…"
            : saved
              ? "Regenerate summary"
              : "Generate summary"}
        </Button>
      </div>
      {saved?.answer ? (
        <>
          <ResearchMarkdown text={saved.answer} sources={data?.sources ?? []} />
          <p className="mt-3 text-xs text-muted-foreground">
            AI generated · {displayDate(saved.createdAt)}
          </p>
        </>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          {research.isPending
            ? "Loading saved summary…"
            : busy
              ? "Reading company sources to prepare a summary. You can close this panel and come back."
              : "Get a short explanation of what they build, who it’s for, and how it works."}
        </p>
      )}
      {error && !busy && (
        <div className="mt-3 text-xs text-muted-foreground" role="alert">
          <p>{error}</p>
          {research.error && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void research.refetch()}
            >
              Try again
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
