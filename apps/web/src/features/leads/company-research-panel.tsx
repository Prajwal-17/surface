import { Link } from "react-router";
import {
  BookOpen,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  PenLine,
  RefreshCw,
  Sparkles,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProfileMarkdown } from "@/components/ui/profile-markdown";
import {
  isRunActive,
  useCompanyOverview,
  useCompanyTags,
  useResearchCompany,
} from "./leads-query";

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function section(content: string, title: string) {
  const match = content.match(
    new RegExp(`## ${title}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`),
  );
  return match?.[1]?.trim() ?? "";
}

export function CompanyResearchPanel({
  companyId,
  companyName,
  companyTags,
}: {
  companyId: string;
  companyName: string;
  companyTags: string[];
}) {
  const overview = useCompanyOverview(companyId);
  const saveTags = useCompanyTags(companyId);
  const research = useResearchCompany();
  const tags = overview.data?.company.tags ?? companyTags;
  const hasResearchTag = tags.includes("research");
  const brief = overview.data?.brief ?? null;
  const evidence = overview.data?.evidence ?? [];
  const researchRun = overview.data?.researchRun ?? null;
  const researchActive = isRunActive(researchRun);

  function toggleResearchTag() {
    const next = hasResearchTag
      ? tags.filter((tag) => tag !== "research")
      : [...tags, "research"];
    saveTags.mutate(next, {
      onSuccess: () =>
        toast.success(
          hasResearchTag
            ? "Removed research tag"
            : "Marked company as research",
        ),
      onError: (error) => toast.error(error.message),
    });
  }

  function startResearch() {
    research.mutate(
      { companyId },
      {
        onSuccess: () => toast.success("Research run started"),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const overviewText = brief ? section(brief.content, "Overview") : "";
  const angleText = brief
    ? section(brief.content, "Suggested outreach angle")
    : "";
  const sourcesById = new Map(
    (brief?.sources ?? []).map((source, index) => [
      source.id,
      { source, number: index + 1 },
    ]),
  );

  return (
    <section
      aria-labelledby="company-research-heading"
      className="border-b p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3
          id="company-research-heading"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <BookOpen className="size-4 text-brand" />
          Lead research
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.includes("lead") ? (
            <Badge variant="outline" className="status-pill tone-blue gap-1">
              <Tag className="size-3" />
              Lead
            </Badge>
          ) : null}
          {hasResearchTag ? (
            <Badge variant="outline" className="status-pill tone-mint gap-1">
              <Tag className="size-3" />
              Research
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={saveTags.isPending}
          onClick={toggleResearchTag}
        >
          {saveTags.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Tag />
          )}
          {hasResearchTag ? "Remove research tag" : "Mark research"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={research.isPending || researchActive}
          onClick={startResearch}
        >
          {research.isPending || researchActive ? (
            <LoaderCircle className="animate-spin" />
          ) : brief ? (
            <RefreshCw />
          ) : (
            <Sparkles />
          )}
          {researchActive
            ? "Researching…"
            : brief
              ? "Refresh research"
              : "Research company"}
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link to={`/writing?company=${encodeURIComponent(companyId)}`}>
            <PenLine /> Draft outreach
          </Link>
        </Button>
      </div>

      {researchRun && researchActive ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-brand/25 bg-brand/5 p-2.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin text-brand" />
          Research run in progress. This panel updates automatically.
        </p>
      ) : null}

      {researchRun?.state === "failed" && researchRun.error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
        >
          Research run failed: {researchRun.error}
        </p>
      ) : null}

      {overview.isLoading && !overview.data ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading research…</p>
      ) : overview.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Could not load research: {overview.error.message}
        </p>
      ) : brief ? (
        <article
          aria-label={`Research brief for ${companyName}`}
          className="mt-4 rounded-md border bg-muted/20 p-3"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold">Research brief</h4>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatDate(brief.createdAt)}
              {brief.model ? ` · ${brief.model}` : ""}
            </span>
          </header>
          {overviewText ? (
            <div className="mt-2 text-sm leading-relaxed">
              <ProfileMarkdown>{overviewText}</ProfileMarkdown>
            </div>
          ) : null}
          {angleText ? (
            <div className="mt-3 rounded-md border border-border/70 bg-background p-2.5">
              <p className="text-xs font-semibold">Suggested outreach angle</p>
              <div className="mt-1 text-sm leading-relaxed">
                <ProfileMarkdown>{angleText}</ProfileMarkdown>
              </div>
            </div>
          ) : null}
          {brief.findings.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold">Sourced findings</p>
              <ul className="mt-2 space-y-2">
                {brief.findings.map((finding, index) => (
                  <li key={`${finding.claim}-${index}`} className="text-sm">
                    <p className="leading-relaxed">{finding.claim}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {finding.sourceIds.map((sourceId) => {
                        const item = sourcesById.get(sourceId);
                        if (!item) return null;
                        return (
                          <a
                            key={sourceId}
                            href={item.source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 text-[11px] text-brand underline-offset-4 hover:underline"
                          >
                            <span className="tabular-nums">
                              [{item.number}]
                            </span>
                            <span className="truncate">
                              {item.source.title || hostname(item.source.url)}
                            </span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              This brief has sources but no claim-level citations. Generate a
              new brief to attach citations to individual claims.
            </p>
          )}
          {brief.sources.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold">Sources</p>
              <ol className="mt-1 space-y-1">
                {brief.sources.map((source, index) => (
                  <li key={source.id} className="text-xs">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand underline-offset-4 hover:underline"
                    >
                      [{index + 1}] {source.title || hostname(source.url)}
                    </a>
                    <span className="text-muted-foreground">
                      {" "}
                      · retrieved {source.retrievedAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </article>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No research brief yet. Mark the company for research, then generate a
          sourced brief before drafting outreach.
        </p>
      )}

      {evidence.length ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold">Lead evidence</h4>
          <ul className="mt-2 space-y-2">
            {evidence.slice(0, 6).map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border/70 p-2.5"
              >
                <p className="text-xs font-medium leading-5">{item.claim}</p>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-brand underline-offset-4 hover:underline"
                >
                  <span className="truncate">
                    {item.pageTitle || hostname(item.sourceUrl)}
                  </span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground">
                    Source excerpt
                  </summary>
                  <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                    {item.excerpt}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
