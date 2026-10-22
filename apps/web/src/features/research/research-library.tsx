import { Link } from "react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Search, BookOpen } from "lucide-react";
import {
  researchListSchema,
  researchResolveSchema,
  companySchema,
  type ResearchCandidate,
} from "@surface/contracts";
import { apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { CompanyMark } from "@/components/ui/company-mark";
import { ResearchComposer } from "@/components/ai/research-composer";
import { AiLoadingState } from "@/components/ai/loading-state";
import { LoadingRows } from "@/components/feedback/loading-state";
import { toast } from "sonner";
export function ResearchLibrary({
  initialQuery,
  navigateToCompany,
}: {
  initialQuery: string;
  navigateToCompany: (companyId: string) => void | Promise<void>;
}) {
  const client = useQueryClient();
  const [filter, setFilter] = useState(""),
    [candidates, setCandidates] = useState<ResearchCandidate[]>([]);
  const library = useQuery({
    queryKey: ["research-library"],
    queryFn: async () =>
      researchListSchema.parse(await apiClient("/api/research")),
    refetchInterval: (q) =>
      q.state.data?.some((c) => c.run?.state === "running") ? 3000 : false,
  });
  const resolve = useMutation({
    mutationFn: async (query: string) =>
      researchResolveSchema.parse(
        await apiClient("/api/research/resolve", {
          method: "POST",
          body: JSON.stringify({ query }),
        }),
      ),
    onSuccess: (result) => {
      if (result.companyId) void navigateToCompany(result.companyId);
      else setCandidates(result.candidates);
    },
    onError: (e) => toast.error(e.message),
  });
  const confirm = useMutation({
    mutationFn: async (candidate: ResearchCandidate) => {
      const company = companySchema.parse(
        await apiClient("/api/research/confirm", {
          method: "POST",
          body: JSON.stringify(candidate),
        }),
      );
      await client.invalidateQueries({ queryKey: ["companies"] });
      await client.invalidateQueries({ queryKey: ["research-library"] });
      if (!candidate.companyId) {
        const detail = await apiClient<{
          reports: unknown[];
          runs: { state: string }[];
        }>(`/api/companies/${company.id}/research`);
        if (
          !detail.reports.length &&
          !detail.runs.some((r) => r.state === "running")
        )
          await apiClient(`/api/companies/${company.id}/research`, {
            method: "POST",
          }).catch((e) => toast.error(e.message));
      }
      await navigateToCompany(company.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const rows = library.data?.filter(({ company }) =>
    `${company.name} ${company.website}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <div className="mx-auto w-full max-w-6xl pb-4">
      <section className="mb-4 flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">
            Company research
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your shortlist, with the facts that matter.
          </p>
        </div>
        <div className="w-full lg:max-w-md">
          <ResearchComposer
            placeholder="Company name or website…"
            initialValue={initialQuery}
            busy={resolve.isPending || confirm.isPending}
            onSend={async (text) => {
              setCandidates([]);
              await resolve.mutateAsync(text);
            }}
          />
          {resolve.isPending && (
            <div className="mt-4">
              <AiLoadingState label="Finding the company" />
            </div>
          )}
          {resolve.error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {resolve.error.message}
            </p>
          )}
          {!!candidates.length && (
            <div className="mt-5 rounded-lg border bg-card p-4">
              <p className="mb-3 text-sm font-medium">
                Choose the company to research
              </p>
              <div className="divide-y">
                {candidates.map((c) => (
                  <button
                    key={c.companyId ?? c.website}
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate(c)}
                    className="flex w-full items-center gap-3 rounded-md py-4 text-left hover:bg-secondary disabled:opacity-60"
                  >
                    <CompanyMark name={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{c.name}</span>
                      <span className="block break-all text-xs text-brand">
                        {c.website}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {c.description}
                      </span>
                    </span>
                    <ArrowRight className="mr-2 size-4 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="size-4 text-muted-foreground" /> Saved research{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {library.data?.length ?? ""}
            </span>
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              aria-label="Find saved company"
              placeholder="Find a saved company"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {library.isPending && (
          <LoadingRows label="Loading company research" count={3} />
        )}
        {library.error && (
          <p role="alert" className="text-destructive">
            {library.error.message}
          </p>
        )}
        {rows?.length === 0 && (
          <div className="py-16 text-center">
            <Building2 className="mx-auto mb-4 size-8 text-muted-foreground" />
            <h3 className="font-medium">
              {filter ? "No matching companies" : "Your research belongs here"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {filter
                ? "Try another name or domain."
                : "Start with a company above. Its report and sources will be saved by name."}
            </p>
          </div>
        )}
        <div className="research-library-rows">
          {rows?.map(({ company, report, run }) => (
            <Link
              key={company.id}
              to={`/research/${encodeURIComponent(company.id)}`}
              className="research-library-row group"
            >
              <div className="flex min-w-0 items-center gap-3">
                <CompanyMark
                  name={company.name}
                  className="size-7 text-caption"
                />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {company.name}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {company.website
                      ? new URL(company.website).hostname
                      : "Website not set"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`status-pill ${run?.state === "running" ? "tone-blue" : report ? "tone-mint" : run?.state === "failed" ? "tone-rose" : "tone-muted"}`}
                >
                  {run?.state === "running"
                    ? "Researching"
                    : report
                      ? "Report saved"
                      : (run?.state ?? "Not researched")}
                </span>
                {company.archived && (
                  <span className="text-xs text-muted-foreground">
                    Archived
                  </span>
                )}
              </div>
              <time
                className="text-xs text-muted-foreground"
                dateTime={
                  report?.createdAt ?? run?.completedAt ?? run?.createdAt
                }
              >
                {report
                  ? new Date(report.createdAt).toLocaleDateString()
                  : run
                    ? new Date(
                        run.completedAt ?? run.createdAt,
                      ).toLocaleDateString()
                    : "No updates"}
              </time>
              <ArrowRight className="size-4 text-muted-foreground group-hover:text-brand" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
