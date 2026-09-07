import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  RecommendationCard,
  ContextCards,
} from "@/components/ai/assessment-cards";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { type Job, type JobStatus } from "backend/contracts";
import { useEffect, useSyncExternalStore } from "react";
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
  TriangleAlert,
  X,
  BriefcaseBusiness,
  Banknote,
  CalendarDays,
  Globe2,
} from "lucide-react";
import { formatDate, formatCompensation } from "@/lib/utils";
import { JobActions } from "./job-actions";
import { CompanyMark } from "@/components/ui/company-mark";
import { JobLocation } from "./job-location";
import { JobFitBadge } from "./job-fit-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface JobDetailSheetProps {
  job: Job | null;
  onClose: () => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
  isUpdating: boolean;
  loading?: boolean;
}

export function JobDetailSheet({
  job,
  onClose,
  onStatusChange,
  isUpdating,
  loading = false,
}: JobDetailSheetProps) {
  const client = useQueryClient();
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
    onError: (error) => toast.error(error.message),
  });
  const wide = useSyncExternalStore(
    subscribeWidth,
    () => window.matchMedia("(min-width: 1100px)").matches,
    () => false,
  );
  useEffect(() => {
    if ((!job && !loading) || !wide) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [job, loading, onClose, wide]);
  if (loading && !job) {
    const skeleton = <ReaderLoadingContent />;
    if (wide)
      return (
        <aside
          aria-label="Job reader"
          className="job-reader flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b p-5">
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
        <SheetContent className="flex h-full w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <SheetHeader className="shrink-0 border-b p-5 pr-14 text-left">
            <SheetTitle>Loading job</SheetTitle>
            <SheetDescription>
              Getting the description and assessment.
            </SheetDescription>
          </SheetHeader>
          {skeleton}
        </SheetContent>
      </Sheet>
    );
  }
  if (!job) return null;
  const heading = (
    <div className="min-w-0">
      <h2 className="break-words text-lg font-semibold leading-6 tracking-tight">
        {job.title}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <CompanyMark
            name={job.company}
            className="size-5 rounded text-[9px]"
          />
          <span className="font-medium text-foreground">{job.company}</span>
        </span>
        <JobLocation job={job} showLabel />
      </div>
    </div>
  );
  const headerActions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      <JobActions
        job={job}
        compact
        isPending={isUpdating}
        onChange={(status) => onStatusChange(job, status)}
      />
      <Button asChild size="sm">
        <a href={job.applyUrl} target="_blank" rel="noreferrer">
          Open original
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6">
      <dl className="mb-5 grid grid-cols-2 gap-x-5 text-xs">
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
          <div key={label} className="border-b border-border py-3 pr-3">
            <dt className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
            </dt>
            <dd className="break-words font-medium capitalize leading-5">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mb-5 flex items-center justify-between gap-2">
        <span
          className={`status-pill ${job.reviewedAt ? "tone-mint" : "tone-muted"}`}
        >
          {job.reviewedAt ? (
            <>
              <Check className="size-3" />
              Reviewed
            </>
          ) : (
            "Not reviewed"
          )}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={review.isPending}
          onClick={() => review.mutate()}
        >
          {job.reviewedAt ? "Mark unreviewed" : "Mark as reviewed"}
        </Button>
      </div>
      <Tabs key={job.id} defaultValue="overview">
        <TabsList aria-label="Job details" className="mb-5 gap-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="sources">Sources & history</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <section className="mb-5">
            <h3 className="section-label mb-4">About the role</h3>
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
        <TabsContent value="assessment">
          <section
            className={`mb-5 rounded-md border p-3 ${job.eligibility.state === "meets" ? "border-border bg-transparent" : job.eligibility.state === "conflicts" ? "border-destructive/20 bg-transparent" : "border-border bg-transparent"}`}
          >
            <h3
              className={`flex items-center gap-2 text-xs font-semibold ${job.eligibility.state === "meets" ? "text-success" : job.eligibility.state === "conflicts" ? "text-destructive" : "text-warning"}`}
            >
              {job.eligibility.state === "meets" ? (
                <Check className="size-4" />
              ) : (
                <TriangleAlert className="size-4" />
              )}
              {
                {
                  meets: "Meets stated constraints",
                  clarify: "Needs clarification",
                  conflicts: "Conflicts with constraints",
                }[job.eligibility.state]
              }
            </h3>
            <ul className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">
              {job.eligibility.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
          <RecommendationCard
            job={job}
            onSave={() => onStatusChange(job, "saved")}
            disabled={isUpdating}
          />
          {job.assessment && <ContextCards assessment={job.assessment} />}
          {job.fit && !job.assessment ? (
            <section className="mb-6 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-foreground">
                  Legacy assessment · stale
                </h2>
                <JobFitBadge fit={job.fit} stale />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {job.fit.summary}
              </p>

              {job.fit.strengths.length ? (
                <div className="mt-4">
                  <h3 className="text-xs font-medium text-foreground">
                    Why it fits
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {job.fit.strengths.map((strength, index) => (
                      <li
                        key={`${index}-${strength}`}
                        className="flex gap-2 text-xs leading-5 text-muted-foreground"
                      >
                        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {job.fit.concerns.length ? (
                <div className="mt-4">
                  <h3 className="text-xs font-medium text-foreground">
                    Things to check
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {job.fit.concerns.map((concern, index) => (
                      <li
                        key={`${index}-${concern}`}
                        className="flex gap-2 text-xs leading-5 text-muted-foreground"
                      >
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-brand" />
                        {concern}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
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
              {job.assessmentHistory.map((a) => (
                <Collapsible key={a.id} className="text-sm">
                  <CollapsibleTrigger>
                    Assessment history · Profile revision {a.profileRevision} ·{" "}
                    {formatDate(a.createdAt)}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-muted-foreground">
                      Interpretation: {a.output.summary}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              ))}
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
              <a
                className="text-sm underline"
                href={`/?job=${duplicate.leftId === job.id ? duplicate.rightId : duplicate.leftId}`}
              >
                Inspect other listing
              </a>
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
        aria-label="Job reader"
      >
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b bg-card px-5 py-4 lg:px-6">
          <div className="min-w-0 flex-1">{heading}</div>
          <div className="col-span-2 row-start-2 justify-self-start">
            {headerActions}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="col-start-2 row-start-1 size-9 shrink-0"
            onClick={onClose}
            aria-label="Close job reader"
          >
            <X />
          </Button>
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
        <SheetHeader className="shrink-0 flex-row flex-wrap items-start gap-3 space-y-0 border-b px-5 py-3 pr-14 text-left">
          <div className="min-w-0 basis-full">
            <SheetTitle className="text-lg leading-6">{job.title}</SheetTitle>
            <SheetDescription className="mt-1 flex items-center gap-2 text-xs">
              <span>{job.company}</span>
              <JobLocation job={job} showLabel />
            </SheetDescription>
          </div>
          {headerActions}
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
function subscribeWidth(callback: () => void) {
  const media = window.matchMedia("(min-width: 1100px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
