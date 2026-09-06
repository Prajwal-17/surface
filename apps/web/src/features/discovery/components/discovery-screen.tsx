"use client";

import type {
  DiscoverySearchInput,
  DiscoverySearchResponse,
  Job,
  JobStatus,
  SourceKey,
} from "backend/contracts";
import { LoaderCircle, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { JobDetailSheet } from "@/features/jobs/components/job-detail-sheet";
import { JobFilters } from "@/features/jobs/components/job-filters";
import { JobList } from "@/features/jobs/components/job-list";
import { JobStatusTabs } from "@/features/jobs/components/job-status-tabs";
import { useAnalyzeJobs } from "@/features/jobs/hooks/use-analyze-jobs";
import { useJobs } from "@/features/jobs/hooks/use-jobs";
import { useUpdateJobStatus } from "@/features/jobs/hooks/use-update-job-status";
import { PreferencesSheet } from "@/features/profile/components/preferences-sheet";
import { useJobPreferences } from "@/features/profile/hooks/use-job-preferences";
import { useRunDiscovery } from "../hooks/use-run-discovery";
import { SearchForm } from "./search-form";
import { SourceSummary } from "./source-summary";

export function DiscoveryScreen() {
  const [status, setStatus] = useState<JobStatus>("inbox");
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState<SourceKey>();
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [lastResult, setLastResult] = useState<DiscoverySearchResponse>();
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const discovery = useRunDiscovery();
  const analysis = useAnalyzeJobs();
  const statusMutation = useUpdateJobStatus();
  const preferencesQuery = useJobPreferences();
  const jobsQuery = useJobs({
    status,
    search: filter,
    source,
    page,
    limit: 24,
  });

  async function handleSearch(input: DiscoverySearchInput) {
    const result = await discovery.mutateAsync(input);
    setLastResult(result);
    setStatus("inbox");
    setPage(1);
  }

  function handleStatusChange(job: Job, nextStatus: JobStatus) {
    statusMutation.mutate(
      { id: job.id, status: nextStatus },
      {
        onSuccess: (updatedJob) => {
          if (selectedJob?.id === updatedJob.id) {
            setSelectedJob(updatedJob.status === status ? updatedJob : null);
          }
        },
      },
    );
  }

  function changeStatus(nextStatus: JobStatus) {
    setStatus(nextStatus);
    setPage(1);
  }

  function openPreferences() {
    setSelectedJob(null);
    setPreferencesOpen(true);
  }

  function analyzeInbox() {
    if (!preferencesQuery.data) {
      openPreferences();
      return;
    }

    setSelectedJob(null);
    analysis.mutate();
  }

  return (
    <>
      <section className="workspace-enter">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[2.25rem] leading-[1.1] tracking-[-0.045em] sm:text-[3rem]">
            Your next <span className="text-brand">chapter.</span>
          </h1>
          <Button variant="outline" onClick={openPreferences}>
            <SlidersHorizontal />
            {preferencesQuery.data ? "Preferences" : "Set preferences"}
          </Button>
        </div>

        <SearchForm onSubmit={handleSearch} isSearching={discovery.isPending} />
      </section>

      <div className="workspace-enter mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16.5rem] lg:gap-10">
        <section className="min-w-0">
          <div className="mb-5 flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2.5 text-lg font-medium tracking-[-0.025em]">
                Your opportunities
                <span className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] tracking-normal text-muted-foreground">
                  {jobsQuery.data?.total ?? "—"}
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {status === "inbox" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={analyzeInbox}
                    disabled={
                      analysis.isPending ||
                      preferencesQuery.isLoading ||
                      jobsQuery.isLoading ||
                      (Boolean(preferencesQuery.data) &&
                        jobsQuery.data?.total === 0)
                    }
                    aria-busy={analysis.isPending}
                  >
                    {analysis.isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    {analysis.isPending
                      ? "Analyzing"
                      : preferencesQuery.data
                        ? "Analyze next 10"
                        : "Set preferences"}
                  </Button>
                ) : null}
                <JobStatusTabs value={status} onChange={changeStatus} />
              </div>
            </div>

            <JobFilters
              search={filter}
              source={source}
              onSearchChange={(value) => {
                setFilter(value);
                setPage(1);
              }}
              onSourceChange={(value) => {
                setSource(value);
                setPage(1);
              }}
            />
          </div>

          <JobList
            data={jobsQuery.data}
            isLoading={jobsQuery.isLoading}
            error={jobsQuery.error}
            status={status}
            page={page}
            onPageChange={setPage}
            onSelect={setSelectedJob}
            onStatusChange={handleStatusChange}
            updatingJobId={
              statusMutation.isPending
                ? statusMutation.variables?.id
                : undefined
            }
          />
        </section>

        <aside className="lg:sticky lg:top-6">
          <SourceSummary
            result={lastResult}
            isSearching={discovery.isPending}
          />
        </aside>
      </div>

      <JobDetailSheet
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onStatusChange={handleStatusChange}
        isUpdating={statusMutation.isPending}
      />
      <PreferencesSheet
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        preferences={preferencesQuery.data}
      />
    </>
  );
}
