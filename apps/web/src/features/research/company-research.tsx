import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  Copy,
  Globe2,
  RefreshCw,
  Square,
  ChevronDown,
} from "lucide-react";
import { researchDetailSchema, type ResearchSource } from "@surface/contracts";
import { useResearchRun, researchPhaseLabel } from "./use-research-run";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { CopyMessage } from "./copy-message";
import { CompanyLinks } from "./company-links";
import { ClarificationAnswer } from "./clarification-answer";
import { ReportContent } from "./report-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AiLoadingState } from "@/components/ai/loading-state";
import { ResearchComposer } from "@/components/ai/research-composer";
import { LoadingRows } from "@/components/feedback/loading-state";
import { ResearchMarkdown } from "./research-markdown";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
function Sources({ sources }: { sources: ResearchSource[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {sources.map((s) => (
        <Collapsible
          key={s.id}
          open={selected === s.id}
          onOpenChange={(open) => setSelected(open ? s.id : null)}
          className="rounded-lg border p-3"
        >
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 shrink-0 text-muted-foreground" />
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-brand"
              title={s.url}
            >
              {s.title || s.url}
            </a>
            <CollapsibleTrigger
              className="w-auto shrink-0 rounded p-1 hover:bg-secondary"
              aria-label={`Show saved evidence for ${s.title}`}
            >
              <ChevronDown className="size-4" />
            </CollapsibleTrigger>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>
              {s.kind === "search" ? "Search snippet" : "Crawled page"}
            </span>
            <time>{new Date(s.retrievedAt).toLocaleDateString()}</time>
            {!["ok", "snippet"].includes(s.status) && (
              <span className="break-words text-warning">{s.status}</span>
            )}
          </div>
          <CollapsibleContent>
            <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
              {s.text || "No readable evidence was available."}
            </p>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
export function CompanyResearch({
  companyId,
  expanded = false,
}: {
  companyId: string;
  expanded?: boolean;
}) {
  const client = useQueryClient();
  const [view, setView] = useState("report"),
    [versionId, setVersionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);
  const queryKey = ["company-research", companyId];
  const detail = useQuery({
    queryKey,
    queryFn: async () =>
      researchDetailSchema.parse(
        await apiClient(`/api/companies/${companyId}/research`),
      ),
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => r.state === "running") ? 2500 : false,
  });
  const active = detail.data?.runs.find((r) => r.state === "running");
  const live = useResearchRun(companyId, active);
  const mutate = useMutation({
    mutationFn: async ({
      suffix = "",
      body,
    }: {
      suffix?: string;
      body?: unknown;
    }) =>
      apiClient(`/api/companies/${companyId}/research${suffix}`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey });
      await client.invalidateQueries({ queryKey: ["company-opportunities"] });
      await client.invalidateQueries({
        queryKey: ["company-detail", companyId],
      });
    },
    onError: (e) => toast.error(e.message),
  });
  const stop = () => {
    if (active) mutate.mutate({ suffix: `/runs/${active.id}/cancel` });
  };
  if (detail.isPending)
    return (
      <div className="p-8">
        <LoadingRows label="Loading company report" count={5} />
      </div>
    );
  if (detail.error || !detail.data)
    return (
      <div className="p-8">
        <p role="alert" className="mt-5 text-destructive">
          {detail.error?.message ?? "Company not found"}
        </p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void detail.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  const data = detail.data,
    owner = data.company;
  const report =
    data.reports.find((r) => r.id === versionId) ?? data.reports[0];
  const draft =
    active && live.runId === active.id ? live.draft : (active?.draft ?? "");
  const progress =
    live.runId === active?.id
      ? live.events.filter((e) => e.type === "progress")
      : [];
  const latestRun = data.runs.find(
    (r) => r.kind === "report" || r.kind === "links",
  );
  const summaryRunIds = new Set(
    data.runs.filter((r) => r.kind === "summary").map((r) => r.id),
  );
  const questions = data.messages.filter((m) => !summaryRunIds.has(m.runId));
  const reportSources =
    report && versionId
      ? data.sources.filter(
          (s) => report.sourceIds.includes(s.id) || s.runId === report.runId,
        )
      : data.sources;
  const busy = Boolean(active) || mutate.isPending;
  const phase = active && live.runId === active.id ? live.phase : "connecting";
  const status = active ? (
    <div className="space-y-3">
      <AiLoadingState
        label={
          phase === "writing"
            ? "Writing answer"
            : progress.at(-1)?.text ||
              (phase === "gathering"
                ? "Gathering sources"
                : active.kind === "report"
                  ? "Researching company"
                  : "Preparing answer")
        }
      />
      {!!progress.length && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground">
            {progress.length} recent steps <ChevronDown className="size-3" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-3 max-h-44 space-y-2 overflow-y-auto border-l pl-4 text-xs text-muted-foreground">
              {progress.map((e) => (
                <li key={e.id} className="break-words">
                  {e.text}
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  ) : null;
  return (
    <Tabs
      value={view}
      onValueChange={setView}
      className="flex h-full min-h-0 flex-col"
      aria-label="Company research"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setVersionId(null);
            mutate.mutate({});
          }}
        >
          <RefreshCw className="size-4" />
          {active?.kind === "report" ? "Researching…" : "Run research"}
        </Button>
        {active && (
          <Button
            variant="outline"
            size="sm"
            onClick={stop}
            disabled={mutate.isPending}
          >
            <Square className="size-3" />
            Stop
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <CompanyLinks
            links={data.linkReview?.links ?? []}
            checkedAt={data.linkReview?.checkedAt}
            busy={busy}
            onVerify={() => mutate.mutate({ suffix: "/links" })}
          />
        </div>
      </div>
      <TabsList aria-label="Research content" className="shrink-0 gap-4 px-4">
        <TabsTrigger value="report" className="min-h-11 md:min-h-8">
          Report
        </TabsTrigger>
        <TabsTrigger value="chat" className="min-h-11 md:min-h-8">
          Company Q&A
        </TabsTrigger>
        <TabsTrigger value="sources" className="min-h-11 md:min-h-8">
          Sources · {reportSources.length}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="report"
        forceMount
        className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <article
          className="mx-auto max-w-[calc(76ch+32px)] px-4 py-4"
          aria-label="Company report"
        >
          {report && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <time dateTime={report.createdAt}>
                Report saved · {new Date(report.createdAt).toLocaleString()}
              </time>
              <div className="ml-auto flex items-center gap-2">
                {data.reports.length > 1 && (
                  <Select value={report.id} onValueChange={setVersionId}>
                    <SelectTrigger className="w-44" aria-label="Report version">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.reports.map((r, i) => (
                        <SelectItem key={r.id} value={r.id}>
                          {i === 0 ? "Latest · " : ""}
                          {new Date(r.createdAt).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy report as Markdown"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(report.markdown);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      toast.error("Could not copy report to clipboard.");
                    }
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
          )}
          {active && active.kind !== "question" && (
            <div className="mb-5">
              {status}
              {report && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Your saved report stays available while research runs.
                </p>
              )}
            </div>
          )}
          {!active && latestRun && latestRun.state !== "completed" && (
            <div role="alert" className="mb-5 rounded-md border p-3 text-sm">
              <p className="font-medium">
                {researchPhaseLabel(latestRun.state)}
              </p>
              {latestRun.error && (
                <p className="mt-1 text-muted-foreground">{latestRun.error}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Saved reports and sources are retained. Choose Run research to
                try again.
              </p>
            </div>
          )}
          {report ? (
            expanded ? (
              <ResearchMarkdown text={report.markdown} sources={data.sources} />
            ) : (
              <ReportContent
                key={report.id}
                text={report.markdown}
                sources={data.sources}
              />
            )
          ) : active?.kind === "report" && draft ? (
            <div aria-busy="true">
              <ResearchMarkdown text={draft} sources={data.sources} />
              <span className="ai-stream-cursor inline-block h-4 w-0.5 bg-brand" />
            </div>
          ) : (
            <div className="py-10">
              <BookOpen className="mb-4 size-6 text-muted-foreground" />
              <h3 className="text-base font-semibold">No report yet</h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Run research for a deeper look at {owner.name}’s products,
                open-source work, and hiring, with citations to public evidence.
              </p>
            </div>
          )}
          {!active && latestRun?.draft && latestRun.error && (
            <Collapsible className="mt-5 border-t pt-3">
              <CollapsibleTrigger className="text-xs text-muted-foreground">
                Unfinished draft · citations not verified
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ResearchMarkdown
                  text={latestRun.draft}
                  sources={data.sources}
                />
              </CollapsibleContent>
            </Collapsible>
          )}
        </article>
      </TabsContent>
      <TabsContent
        value="sources"
        forceMount
        className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <div className="mx-auto max-w-[calc(76ch+32px)] px-4 py-4">
          {reportSources.length ? (
            <Sources sources={reportSources} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              No saved sources yet. Research collects public evidence for this
              company.
            </p>
          )}
        </div>
      </TabsContent>
      <TabsContent
        value="chat"
        forceMount
        className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        <div
          ref={timeline}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          aria-label={`Questions about ${owner.name}`}
        >
          <div className="mx-auto max-w-[72ch] space-y-5">
            {!questions.length && (
              <div className="space-y-3 py-3">
                <p className="text-sm text-muted-foreground">
                  Ask a question using saved evidence, or enable Search web for
                  fresh sources.
                </p>
                {[
                  "Can I work for them from India?",
                  "Which products are open source?",
                  "Where can I find engineering roles?",
                ].map((question) => (
                  <Button
                    key={question}
                    variant="outline"
                    disabled={busy}
                    className="h-auto w-full justify-start whitespace-normal py-3 text-left text-xs"
                    onClick={() =>
                      mutate.mutate({
                        suffix: "/questions",
                        body: { question, webSearch: false },
                      })
                    }
                  >
                    {question}
                  </Button>
                ))}
              </div>
            )}
            {questions.map((message) => {
              const messageRun = data.runs.find((r) => r.id === message.runId);
              return (
                <div key={message.id} className="space-y-3">
                  <div className="ml-5 rounded-md border bg-secondary/50 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">You</span>
                      <time className="ml-auto">
                        {new Date(message.createdAt).toLocaleDateString()}
                      </time>
                      <CopyMessage
                        text={message.question}
                        label="Copy question"
                      />
                    </div>
                    <p className="whitespace-pre-wrap text-prose leading-[1.65]">
                      {message.question}
                    </p>
                  </div>
                  <div className="mr-3 px-1 py-2">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">Assistant</span>
                      {message.webSearch && <Globe2 className="size-3" />}
                      <span className="ml-auto" />
                      {message.answer && (
                        <CopyMessage
                          text={message.answer}
                          label="Copy answer"
                        />
                      )}
                    </div>
                    {message.answer ? (
                      <ClarificationAnswer
                        text={message.answer}
                        sources={data.sources}
                      />
                    ) : active?.id === message.runId ? (
                      <div className="mt-3 space-y-3">
                        {status}
                        {draft && (
                          <ResearchMarkdown
                            text={draft}
                            sources={data.sources}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">
                          {messageRun?.error || "This answer did not finish."}
                        </p>
                        <Button
                          className="mt-2"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            mutate.mutate({
                              suffix: "/questions",
                              body: {
                                question: message.question,
                                webSearch: message.webSearch,
                              },
                            })
                          }
                        >
                          <RefreshCw className="size-3" />
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="shrink-0 border-t p-3">
          <div className="mx-auto max-w-[72ch]">
            <ResearchComposer
              key={companyId}
              placeholder={`Ask about ${owner.name}…`}
              searchOption
              busy={busy}
              onStop={active ? stop : undefined}
              onSend={async (question, webSearch) => {
                await mutate.mutateAsync({
                  suffix: "/questions",
                  body: { question, webSearch },
                });
                requestAnimationFrame(() =>
                  timeline.current?.scrollTo({
                    top: timeline.current.scrollHeight,
                    behavior: "instant",
                  }),
                );
              }}
            />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
