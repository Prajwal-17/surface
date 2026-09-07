import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
// Adapted from Beautiful UI RecommendationCard.tsx / ContextCards.tsx.
// Copyright (c) 2026 Shane Levine. MIT license: ./LICENSE.md.
// Retains the recommendation/action and source-context structure; uses real assessments.
import type { Assessment, Job } from "backend/contracts";
import Link from "next/link";
import {
  ScanLine,
  ArrowUpRight,
  Bookmark,
  Check,
  Quote,
  ChevronDown,
  CircleHelp,
  FileText,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
export function RecommendationCard({
  job,
  onSave,
  disabled,
}: {
  job: Job;
  onSave: () => void;
  disabled: boolean;
}) {
  const assessment = job.assessment;
  const label = !assessment
    ? ((
        {
          queued: "Queued",
          running: "Analyzing",
          failed: "Needs a retry",
        } as Record<string, string>
      )[job.assessmentState] ?? "Not assessed yet")
    : job.assessmentState !== "current"
      ? "Update needed"
      : assessment.output.score >= 75
        ? "Recommended to review"
        : assessment.output.score >= 50
          ? "Worth a closer look"
          : "Limited fit";
  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-border bg-background/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-brand">
          <ScanLine className="size-4" />
          Fit assessment
        </span>
        <span
          className={`status-pill ${assessment && job.assessmentState === "current" && assessment.output.score >= 75 ? "tone-mint" : "tone-blue"}`}
        >
          {assessment &&
            job.assessmentState === "current" &&
            assessment.output.score >= 75 && <Check className="size-3" />}
          {label}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-[15px] font-semibold">
          {assessment ? "Assessment summary" : "No assessment yet"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {assessment
            ? assessment.output.summary
            : job.assessmentState === "running"
              ? "An assessment is in progress. The result will be available when analysis finishes."
              : job.assessmentState === "queued"
                ? "This role is in the analysis queue. It will be assessed within your daily allowance."
                : "Save your profile to assess this role against your experience and preferences."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <span className="text-xs text-muted-foreground">
          {assessment
            ? "Interpretation · grounded in cited evidence"
            : "Guided by your profile"}
        </span>
        {assessment ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || job.status === "saved"}
            onClick={onSave}
          >
            <Bookmark className="size-3.5" />
            {job.status === "saved" ? "Saved" : "Save for review"}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" asChild className="text-brand">
            <Link href="/profile">
              Your profile <ArrowUpRight />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
export function ContextCards({ assessment }: { assessment: Assessment }) {
  const sections = [
    ["Skills fit", assessment.output.skillsFit],
    ["Growth potential", assessment.output.growthPotential],
    ["Strengths", assessment.output.strengths],
    ["Concerns", assessment.output.concerns],
    ["Project evidence", assessment.output.projectEvidence],
  ] as const;
  return (
    <div className="mb-7 space-y-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-label">The evidence behind the fit</h3>
        <Quote className="size-4 text-brand" />
      </div>
      {sections
        .filter(([, claims]) => claims.length)
        .map(([title, claims]) => (
          <Collapsible
            key={title}
            className="group rounded-xl border bg-background/30"
          >
            <CollapsibleTrigger className="flex list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
              <span
                className={`size-1.5 rounded-full ${title === "Concerns" ? "bg-warning" : "bg-success"}`}
              />
              {title}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {claims.length} {claims.length === 1 ? "finding" : "findings"}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 border-t p-3">
                {claims.map((claim, i) => (
                  <article key={i} className="rounded-lg border bg-card p-3">
                    <span
                      className={`status-pill ${claim.kind === "fact" ? "tone-mint" : "tone-blue"}`}
                    >
                      {claim.kind === "fact" ? "Stated fact" : "Interpretation"}
                    </span>
                    <p className="my-3 text-sm leading-6">{claim.text}</p>
                    {(["jobEvidence", "profileEvidence"] as const).map(
                      (kind) =>
                        claim[kind] && (
                          <div
                            key={kind}
                            className="mt-3 rounded-md bg-secondary/60 p-3"
                          >
                            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand">
                              {kind === "jobEvidence" ? (
                                <FileText className="size-3" />
                              ) : (
                                <UserRound className="size-3" />
                              )}
                              {kind === "jobEvidence"
                                ? "From the listing"
                                : "From your profile"}
                            </div>
                            <blockquote className="border-l-2 border-primary/60 pl-3 text-xs leading-6 text-muted-foreground">
                              “{claim[kind]!.quote}”
                            </blockquote>
                            <p className="mt-2 break-all text-xs text-muted-foreground">
                              {claim[kind]!.field}
                            </p>
                          </div>
                        ),
                    )}
                  </article>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      {assessment.output.unansweredQuestions.length > 0 && (
        <section className="rounded-xl border border-amber-400/20 bg-amber-400/[.04] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <CircleHelp className="size-4" />
            Questions to clarify
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-6 text-muted-foreground">
            {assessment.output.unansweredQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
