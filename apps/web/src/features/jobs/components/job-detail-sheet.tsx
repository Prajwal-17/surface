import {
  RecommendationCard,
  ContextCards,
} from "@/components/ai/assessment-cards";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { type Job, type JobStatus } from "backend/contracts";
import { useSyncExternalStore } from "react";
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
  MapPin,
  BriefcaseBusiness,
  Banknote,
  CalendarDays,
  Globe2,
} from "lucide-react";
import { formatDate, formatCompensation } from "@/lib/utils";
import { JobActions } from "./job-actions";
import { CompanyMark } from "@/components/ui/company-mark";
import { JobFitBadge } from "./job-fit-badge";

interface JobDetailSheetProps {
  job: Job | null;
  onClose: () => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
  isUpdating: boolean;
}

export function JobDetailSheet({
  job,
  onClose,
  onStatusChange,
  isUpdating,
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
  if (!job) return null;
  const heading = (
    <div className="min-w-0">
      <div className="mb-4 flex items-center gap-3">
        <CompanyMark name={job.company} />
        <div>
          <p className="text-sm font-semibold">{job.company}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {job.location}
          </p>
        </div>
      </div>
      <h2 className="break-words text-[20px] font-bold leading-[1.4] tracking-tight">
        {job.title}
      </h2>
    </div>
  );
  const content = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6">
        <dl className="mb-5 grid grid-cols-2 gap-2 text-xs">
          {[
            {
              icon: Globe2,
              label: "Work arrangement",
              value:
                job.workMode === "unknown" ? "Not specified" : job.workMode,
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
            <div key={label} className="rounded-lg bg-secondary/60 p-3">
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
            variant="ghost"
            size="sm"
            disabled={review.isPending}
            onClick={() => review.mutate()}
          >
            {job.reviewedAt ? "Mark unreviewed" : "Mark as reviewed"}
          </Button>
        </div>
        <section
          className={`mb-5 rounded-xl border p-4 ${job.eligibility.state === "meets" ? "border-emerald-400/20 bg-emerald-400/[.04]" : job.eligibility.state === "conflicts" ? "border-rose-400/20 bg-rose-400/[.04]" : "border-amber-400/20 bg-amber-400/[.04]"}`}
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
        <details className="space-y-3 border-t pt-4">
          <summary className="section-label cursor-pointer py-2">
            Sources & history · {job.sourceReferences.length} links
          </summary>
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
                {ref.availability} · Last observed {formatDate(ref.lastSeenAt)}
              </p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            First discovered {formatDate(job.firstSeenAt)} ·{" "}
            {job.versions.length} content versions
          </p>
          {job.assessmentHistory.map((a) => (
            <details key={a.id} className="text-sm">
              <summary>
                Assessment history · Profile revision {a.profileRevision} ·{" "}
                {formatDate(a.createdAt)}
              </summary>
              <p className="text-muted-foreground">
                Interpretation: {a.output.summary}
              </p>
            </details>
          ))}
          {job.versions.map((version) => (
            <details key={version.id} className="text-sm">
              <summary className="cursor-pointer">
                Version · {formatDate(version.createdAt)}
                {version.observationId
                  ? ""
                  : " · Legacy baseline (no historical snapshot)"}
              </summary>
              <pre className="overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(version.content, null, 2)}
              </pre>
            </details>
          ))}
          {job.observations.map((obs) => (
            <details key={obs.id} className="text-sm">
              <summary className="cursor-pointer">
                {obs.method} · {formatDate(obs.observedAt)}
                {obs.incomplete ? " · Incomplete extraction" : ""}
              </summary>
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
            </details>
          ))}
        </details>
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
                      decide.mutate({ id: duplicate.id, action: "separate" })
                    }
                  >
                    Keep separate
                  </Button>
                </>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-5 py-4 lg:px-6">
        <JobActions
          job={job}
          isPending={isUpdating}
          onChange={(status) => onStatusChange(job, status)}
        />
        <Button asChild>
          <a href={job.applyUrl} target="_blank" rel="noreferrer">
            Open original
            <ExternalLink />
          </a>
        </Button>
      </div>
    </>
  );
  if (wide)
    return (
      <aside
        className="panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        aria-label="Job reader"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-5 lg:px-6">
          {heading}
          <Button
            variant="ghost"
            size="icon"
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
        <SheetHeader className="shrink-0 border-b px-5 py-5 pr-14 text-left">
          <SheetTitle className="text-xl leading-7">{job.title}</SheetTitle>
          <SheetDescription>
            {job.company} · {job.location}
          </SheetDescription>
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
