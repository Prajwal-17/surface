"use client";

import type {
  DiscoverySearchInput,
  DiscoverySearchResponse,
  Job,
  JobStatus,
  SourceKey,
} from "@repo/contracts";
import { useState } from "react";
import { pluralize } from "@/lib/utils";
import { JobDetailSheet } from "@/features/jobs/components/job-detail-sheet";
import { JobFilters } from "@/features/jobs/components/job-filters";
import { JobList } from "@/features/jobs/components/job-list";
import { JobStatusTabs } from "@/features/jobs/components/job-status-tabs";
import { useJobs } from "@/features/jobs/hooks/use-jobs";
import { useUpdateJobStatus } from "@/features/jobs/hooks/use-update-job-status";
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

  const discovery = useRunDiscovery();
  const statusMutation = useUpdateJobStatus();
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

  return (
    <>
      <section className="workspace-enter">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="utility-label text-brand">Discovery / 01</p>
            <h1 className="mt-3 max-w-2xl text-[2.35rem] leading-[1.05] tracking-[-0.04em] sm:text-[2.75rem]">
              Find the next role.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
              Search five public job feeds, then sort the useful work into one
              local inbox.
            </p>
          </div>
          <p className="utility-label text-muted-foreground sm:text-right">
            5 sources
            <br />1 workspace
          </p>
        </div>

        <SearchForm onSubmit={handleSearch} isSearching={discovery.isPending} />
      </section>

      <div className="workspace-enter mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-col gap-4 border-b border-border pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[1.35rem] font-normal tracking-[-0.025em]">
                Job ledger
                <span className="ml-2 font-mono text-xs tracking-normal text-muted-foreground">
                  {pluralize(jobsQuery.data?.total ?? 0, "role")}
                </span>
              </h2>
              <JobStatusTabs value={status} onChange={changeStatus} />
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
    </>
  );
}
