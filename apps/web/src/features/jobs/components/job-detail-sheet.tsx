import { Link } from "react-router";
import { AiLoadingState } from "@/components/ai/loading-state";
import { StreamingText } from "@/components/ai/streaming-text";
import { streamSummary } from "../summary-stream";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { JobAssessment } from "./job-assessment";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  DESCRIPTION_SUMMARY_FORMAT_VERSION,
  type Job,
  type JobStatus,
} from "@surface/contracts";
import { useEffect, useRef, useState } from "react";
import { ReaderLoadingContent } from "@/components/feedback/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Check,
  ExternalLink,
  X,
  BriefcaseBusiness,
  Banknote,
  CalendarDays,
  Globe2,
  Square,
} from "lucide-react";
import { formatDate, formatCompensation } from "@/lib/utils";
import { JobActions } from "./job-actions";
import { CompanyMark } from "@/components/ui/company-mark";
import { JobLocation } from "./job-location";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface JobDetailSheetProps {
  job: Job | null;
  onClose: () => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
  isUpdating: boolean;
  loading?: boolean;
  split: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function JobDetailSheet({
  job,
  onClose,
  onStatusChange,
  isUpdating,
  loading = false,
  split: wide,
  error,
  onRetry,
}: JobDetailSheetProps) {
  const client = useQueryClient();
  const [detailTab, setDetailTab] = useState({ jobId: "", value: "overview" });
  const [draft, setDraft] = useState({
    id: "",
    versionId: null as string | null,
    text: "",
  });
  const summaryAbort = useRef<AbortController | null>(null);
  useEffect(() => () => summaryAbort.current?.abort(), []);
  const summary = useMutation({
    mutationFn: async ({
      id,
      regenerate,
      versionId,
    }: {
      id: string;
      versionId: string | null;
      regenerate: boolean;
    }) => {
      summaryAbort.current?.abort();
      const controller = new AbortController();
      summaryAbort.current = controller;
      setDraft({ id, versionId, text: "" });
      return streamSummary(
        id,
        regenerate,
        (text) =>
          setDraft((current) =>
            current.id === id && current.versionId === versionId
              ? { id, versionId, text }
              : current,
          ),
        controller.signal,
      );
    },
    onSuccess: (result, variables) => {
      client.setQueryData<Job>(["jobs", "detail", variables.id], (existing) =>
        existing ? { ...existing, descriptionSummary: result } : existing,
      );
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["analysis-settings"] });
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiClient(`/api/duplicates/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (e) => toast.error(e.message),
  });
  const review = useMutation({
    mutationFn: () =>
      apiClient(`/api/jobs/${job?.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ reviewed: !job?.reviewedAt }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (reviewError) => toast.error(reviewError.message),
  });
  if ((loading || error) && !job) {
    const skeleton = error ? (
      <div
        role="alert"
        className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center"
      >
        <p className="font-medium">Unable to open this role</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          {error.message}
        </p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Close reader
        </Button>
      </div>
    ) : (
      <ReaderLoadingContent />
    );
    if (wide)
      return (
        <aside
          id="job-reader"
          aria-label="Job reader"
          className="job-reader flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b p-3">
            <div className="flex-1 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close job reader"
            >
              <X />
            </Button>
          </div>
          {skeleton}
        </aside>
      );
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (
              document.querySelector<HTMLElement>(
                '[data-job-id][aria-pressed="true"]',
              ) ??
              document.querySelector<HTMLElement>("[data-job-list-heading]")
            )?.focus();
          }}
          className="flex h-full w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <SheetHeader className="shrink-0 border-b p-3 pr-14 text-left">
            <SheetTitle>
              {error ? "Unable to open this role" : "Loading job"}
            </SheetTitle>
            <SheetDescription>Getting the job description.</SheetDescription>
          </SheetHeader>
          {skeleton}
        </SheetContent>
      </Sheet>
    );
  }
  if (!job) return null;
  const summaryForJob =
    summary.variables?.id === job.id &&
    summary.variables.versionId === job.currentVersionId;
  const summaryPending = summaryForJob && summary.isPending;
  const summaryError = summaryForJob ? summary.error : null;
  const savedSummary = job.descriptionSummary;
  const summaryStale =
    savedSummary &&
    (savedSummary.jobVersionId !== job.currentVersionId ||
      savedSummary.formatVersion < DESCRIPTION_SUMMARY_FORMAT_VERSION);
  const streamedText =
    summaryPending &&
    draft.id === job.id &&
    draft.versionId === job.currentVersionId
      ? draft.text
      : "";
  function summarise(regenerate = false) {
    if (!job) return;
    setDetailTab({ jobId: job.id, value: "summary" });
    if (!regenerate && savedSummary && !summaryStale) return;
    summary.mutate({ id: job.id, versionId: job.currentVersionId, regenerate });
  }
  const companyLine = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <CompanyMark
          name={job.company}
          className="size-4 rounded text-[10px]"
        />
        {job.companyWebsite ? (
          <a
            href={job.companyWebsite}
            target="_blank"
            rel="noreferrer"
            title={job.companyWebsite}
            className="truncate font-medium text-foreground underline underline-offset-3 hover:text-brand"
          >
            {job.company}
          </a>
        ) : (
          <span
            className="truncate font-medium text-foreground"
            title={job.company}
          >
            {job.company}
          </span>
        )}
      </span>
      <span
        className="min-w-0 truncate [&>span]:max-w-full [&>span>span]:truncate"
        title={job.location}
      >
        <JobLocation job={job} showLabel />
      </span>
    </div>
  );
  const headerActions = (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button asChild variant="ghost" size="sm">
        <Link
          to={
            job.companyId
              ? `/companies?company=${encodeURIComponent(job.companyId)}&reader=research&queue=all`
              : `/companies?q=${encodeURIComponent(job.companyWebsite || job.company)}&queue=all`
          }
        >
          Research company
        </Link>
      </Button>
      <JobActions
        job={job}
        compact
        isPending={isUpdating}
        onChange={(status) => onStatusChange(job, status)}
      />
      <Button
        variant="ghost"
        size="icon"

        disabled={review.isPending}
        aria-label={job.reviewedAt ? "Mark unreviewed" : "Mark as reviewed"}
        title={
          job.reviewedAt ? "Reviewed · mark unreviewed" : "Mark as reviewed"
        }
        aria-pressed={Boolean(job.reviewedAt)}
        onClick={() => review.mutate()}
      >
        <Check className={job.reviewedAt ? "text-brand" : "opacity-50"} />
      </Button>
      <Button asChild size="sm" className="ml-1 gap-1.5 px-2">
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noreferrer"
          title="Open original listing"
          aria-label="Open original listing"
        >
          Original
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
      <dl className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b pb-3 text-xs">
        {[
          {
            icon: Globe2,
            label: "Work arrangement",
            value: job.workMode === "unknown" ? "Not specified" : job.workMode,
          },
          {
            icon: BriefcaseBusiness,
            label: "Employment",
            value: job.employmentType ?? "Not specified",
          },
          {
            icon: Banknote,
            label: "Compensation",
            value: formatCompensation(job.compensation),
          },
          {
            icon: CalendarDays,
            label: "Date posted",
            value: job.postedAt ? formatDate(job.postedAt) : "Unknown",
          },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            title={`${label}: ${value}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            <dt className="flex items-center text-muted-foreground">
              <Icon className="size-3.5" />
              <span className="sr-only">{label}</span>
            </dt>
            <dd className="break-words capitalize leading-5">{value}</dd>
          </div>
        ))}
      </dl>
      <Tabs
        key={`details:${job.id}`}
        value={detailTab.jobId === job.id ? detailTab.value : "overview"}
        onValueChange={(value) => setDetailTab({ jobId: job.id, value })}
      >
        <TabsList
          aria-label="Job details"
          className="mb-3 gap-3 overflow-x-auto [&>button]:shrink-0 [&>button]:text-xs"
        >
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="summary">AI Summary</TabsTrigger>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="sources">Sources & history</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <section className="mb-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="section-label">About the role</h3>
              <Button
                variant="outline"
                size="sm"
                disabled={summaryPending || !job.description.trim()}
                onClick={() => summarise()}
              >
                {summaryPending ? "Summarising…" : "Summarise"}
              </Button>
            </div>
            {job.descriptionHtml ? (
              <div
                className="job-description"
                dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
              />
            ) : (
              <div className="job-description">
                {(job.description || "No description available.")
                  .split(
                    /\n\s*\n|(?=(?:The Role|Requirements|Responsibilities|What we offer|What you will do|Benefits):)/i,
                  )
                  .filter(Boolean)
                  .map((paragraph, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {paragraph}
                    </p>
                  ))}
              </div>
            )}
          </section>
        </TabsContent>
        <TabsContent value="summary" className="space-y-4 text-sm leading-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={summaryPending || !job.description.trim()}
              onClick={() => summarise(Boolean(savedSummary))}
            >
              {summaryPending
                ? "Summarising…"
                : savedSummary
                  ? "Regenerate"
                  : "Summarise"}
            </Button>
            {summaryPending && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => summaryAbort.current?.abort()}
              >
                <Square className="size-3" />
                Stop
              </Button>
            )}
          </div>
          <div
            aria-live="polite"
            aria-busy={summaryPending}
            className="space-y-3"
          >
            {summaryPending && (
              <AiLoadingState
                label={
                  streamedText
                    ? "Writing summary"
                    : "Reading company and role details"
                }
              />
            )}
            {streamedText ? (
              <StreamingText text={streamedText} streaming markdown />
            ) : savedSummary ? (
              <StreamingText
                text={savedSummary.text}
                markdown={
                  savedSummary.formatVersion >=
                  DESCRIPTION_SUMMARY_FORMAT_VERSION
                }
              />
            ) : (
              !summaryPending && (
                <p className="text-muted-foreground">
                  {job.description.trim()
                    ? "Summarise the company, responsibilities, requirements and employment details."
                    : "No description available to summarise."}
                </p>
              )
            )}
            {summaryStale && (
              <p className="text-muted-foreground">
                Regenerate for the improved Markdown summary of the latest
                company and role details.
              </p>
            )}
          </div>
          {summaryError && <p role="alert">{summaryError.message}</p>}
        </TabsContent>
        <TabsContent value="assessment">
          <JobAssessment key={`assessment:${job.id}`} job={job} />
        </TabsContent>
        <TabsContent value="sources">
          <Collapsible defaultOpen className="space-y-3">
            <CollapsibleTrigger className="section-label cursor-pointer py-2">
              Sources & history · {job.sourceReferences.length} links
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="text-sm text-muted-foreground">
                {job.availability === "open"
                  ? "Observed open"
                  : job.availability === "closed"
                    ? "Closed across monitored sources"
                    : "Possibly closed / availability unverified"}
              </p>
              {job.sourceReferences.map((ref) => (
                <div key={ref.id} className="text-sm">
                  <a
                    className="break-all underline"
                    href={ref.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {new URL(ref.sourceUrl).hostname} · {ref.source}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {ref.availability} · Last observed{" "}
                    {formatDate(ref.lastSeenAt)}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                First discovered {formatDate(job.firstSeenAt)} ·{" "}
                {job.versions.length} content versions
              </p>
              {job.versions.map((version) => (
                <Collapsible key={version.id} className="text-sm">
                  <CollapsibleTrigger className="cursor-pointer">
                    Version · {formatDate(version.createdAt)}
                    {version.observationId
                      ? ""
                      : " · Legacy baseline (no historical snapshot)"}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="overflow-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(version.content, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ))}
              {job.observations.map((obs) => (
                <Collapsible key={obs.id} className="text-sm">
                  <CollapsibleTrigger className="cursor-pointer">
                    {obs.method} · {formatDate(obs.observedAt)}
                    {obs.incomplete ? " · Incomplete extraction" : ""}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {obs.rawAvailable ? (
                      <a
                        className="underline"
                        href={`/api/snapshots/${obs.snapshotId}/download`}
                      >
                        Download raw evidence
                      </a>
                    ) : (
                      <p className="text-muted-foreground">
                        Raw evidence unavailable or removed
                      </p>
                    )}
                    {obs.evidence.map((field, i) => (
                      <p key={i} className="my-2 break-words text-xs">
                        <strong>{field.field}</strong>: {field.value}
                        <br />
                        <span className="text-muted-foreground">
                          {field.reference}
                        </span>
                      </p>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </CollapsibleContent>
          </Collapsible>
          {job.duplicates.map((duplicate) => (
            <section
              key={duplicate.id}
              className="mt-4 space-y-3 rounded-lg border p-3"
            >
              <h3 className="font-medium">
                Duplicate review · {duplicate.state}
              </h3>
              <Link
                className="text-sm underline"
                to={`/?job=${encodeURIComponent(duplicate.leftId === job.id ? duplicate.rightId : duplicate.leftId)}`}
              >
                Inspect other listing
              </Link>
              <div className="flex flex-wrap gap-2">
                {duplicate.state === "merged" ? (
                  <Button
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({ id: duplicate.id, action: "undo" })
                    }
                  >
                    Undo merge
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ id: duplicate.id, action: "merge" })
                      }
                    >
                      Same job
                    </Button>
                    <Button
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({
                          id: duplicate.id,
                          action: "separate",
                        })
                      }
                    >
                      Keep separate
                    </Button>
                  </>
                )}
              </div>
            </section>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
  if (wide)
    return (
      <aside
        className="job-reader flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        id="job-reader"
        aria-label="Job reader"
      >
        <div className="shrink-0 space-y-1 border-b bg-card px-4 py-2.5">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 break-words pt-0.5 text-lg font-semibold leading-6 tracking-tight">
              {job.title}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 size-7"
              onClick={onClose}
              aria-label="Close job reader"
            >
              <X />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {companyLine}
            {headerActions}
          </div>
        </div>
        {content}
      </aside>
    );
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="flex h-full w-full max-w-none flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-none"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target =
            document.querySelector<HTMLElement>(
              `[data-job-id="${CSS.escape(job.id)}"]`,
            ) ?? document.querySelector<HTMLElement>("[data-job-list-heading]");
          target?.focus();
        }}
      >
        <SheetHeader className="shrink-0 gap-1.5 space-y-0 border-b px-4 py-2.5 text-left">
          <div className="min-w-0 basis-full">
            <SheetTitle className="pr-9 text-lg leading-6">
              {job.title}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Job details for {job.company}
            </SheetDescription>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {companyLine}
            {headerActions}
          </div>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
