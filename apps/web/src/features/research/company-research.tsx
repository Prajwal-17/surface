"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PanelRightClose,
  PanelRightOpen,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Globe2,
  MessageSquare,
  RefreshCw,
  Square,
  ChevronDown,
} from "lucide-react";
import {
  researchDetailSchema,
  researchEventSchema,
  type ResearchEvent,
  type ResearchSource,
} from "backend/contracts";
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
export function CompanyResearch({ companyId }: { companyId: string }) {
  const client = useQueryClient();
  const [view, setView] = useState("report"),
    [versionId, setVersionId] = useState<string | null>(null),
    [live, setLive] = useState<{
      runId: string;
      text: string;
      events: ResearchEvent[];
    }>({ runId: "", text: "", events: [] });
  const [chatCollapsed, setChatCollapsed] = useState(false);
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
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    const stream = new EventSource(
      `/api/companies/${companyId}/research/runs/${activeId}/events`,
    );
    const receive = (raw: MessageEvent) => {
      const parsed = researchEventSchema.safeParse(JSON.parse(raw.data));
      if (!parsed.success) return;
      const event = parsed.data;
      setLive((previous) => {
        const state =
          previous.runId === activeId
            ? previous
            : { runId: activeId, text: "", events: [] };
        return event.type === "text"
          ? { ...state, text: event.text }
          : {
              ...state,
              events: [
                ...state.events.filter((e) => e.id !== event.id),
                event,
              ].slice(-30),
            };
      });
    };
    stream.addEventListener("progress", receive);
    stream.addEventListener("text", receive);
    const finish = () => {
      stream.close();
      void client.invalidateQueries({
        queryKey: ["company-research", companyId],
      });
      void client.invalidateQueries({ queryKey: ["research-library"] });
    };
    stream.addEventListener("done", finish);
    stream.addEventListener("end", finish);
    return () => stream.close();
  }, [activeId, companyId, client]);
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
      await client.invalidateQueries({ queryKey: ["research-library"] });
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
        <Link href="/research" className="text-brand">
          Back to research
        </Link>
        <p role="alert" className="mt-5 text-destructive">
          {detail.error?.message ?? "Company not found"}
        </p>
      </div>
    );
  const data = detail.data,
    owner = data.company;
  const report =
    data.reports.find((r) => r.id === versionId) ?? data.reports[0];
  const draft =
    active && live.runId === active.id ? live.text : (active?.draft ?? "");
  const progress =
    live.runId === active?.id
      ? live.events.filter((e) => e.type === "progress")
      : [];
  const latestRun = data.runs[0];
  const reportSources =
    report && versionId
      ? data.sources.filter(
          (s) => report.sourceIds.includes(s.id) || s.runId === report.runId,
        )
      : data.sources;
  const busy = Boolean(active) || mutate.isPending;
  const status = active ? (
    <div className="space-y-3">
      <AiLoadingState
        label={
          progress.at(-1)?.text ||
          (active.kind === "report"
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
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 border-b px-4 lg:hidden"
        role="tablist"
        aria-label="Company research views"
      >
        {[
          { id: "report", label: "Report", icon: BookOpen },
          { id: "chat", label: "Company Q&A", icon: MessageSquare },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => {
              setView(id);
              if (id === "chat") setChatCollapsed(false);
            }}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm ${view === id ? "border-brand text-brand" : "border-transparent text-muted-foreground"}`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Company report"
          className={`${view === "report" ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-hidden lg:flex`}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
            <Button asChild variant="ghost" size="icon" className="size-7">
              <Link href="/research" aria-label="Back to company research">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="min-w-0 max-w-[50vw] truncate text-sm font-semibold">
              {owner.name}
            </h1>
            <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
              <CompanyLinks
                links={data.linkReview?.links ?? []}
                checkedAt={data.linkReview?.checkedAt}
                busy={busy}
                onVerify={() => mutate.mutate({ suffix: "/links" })}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              disabled={busy}
              onClick={() => {
                setVersionId(null);
                mutate.mutate({});
              }}
            >
              <RefreshCw className="size-4" />
              {data.reports.length ? "Refresh" : "Research"}
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
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article className="mx-auto max-w-3xl px-5 py-4 sm:px-8 sm:py-5">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="font-medium tracking-wider">BRIEFING</span>
                {report && (
                  <time>{new Date(report.createdAt).toLocaleString()}</time>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {data.reports.length > 1 && (
                    <Select value={report?.id} onValueChange={setVersionId}>
                      <SelectTrigger
                        className="w-44"
                        aria-label="Report version"
                      >
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
                  {report && (
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
                  )}
                </div>
              </div>
              {active && active.kind !== "question" && (
                <div className="mb-6 rounded-lg border bg-secondary/30 p-4">
                  {status}
                  {report && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Your saved report stays available while the refreshed
                      version is prepared.
                    </p>
                  )}
                </div>
              )}
              {!active && latestRun?.error && (
                <div
                  role="alert"
                  className="mb-6 rounded-lg border border-warning/40 p-4 text-sm"
                >
                  <p className="mb-1 font-medium capitalize">
                    Research {latestRun.state}
                  </p>
                  <p className="text-muted-foreground">{latestRun.error}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Collected sources are saved. Refresh the report or retry
                    your question to continue.
                  </p>
                </div>
              )}
              {report ? (
                <ReportContent
                  key={report.id}
                  text={report.markdown}
                  sources={data.sources}
                />
              ) : active?.kind === "report" && draft ? (
                <div aria-busy="true">
                  <ResearchMarkdown text={draft} sources={data.sources} />
                  <span className="ai-stream-cursor inline-block h-4 w-0.5 bg-brand" />
                </div>
              ) : (
                <div className="py-16">
                  <BookOpen className="mb-5 size-8 text-brand" />
                  <h2 className="text-2xl font-semibold tracking-tight">
                    A clearer picture of {owner.name}
                  </h2>
                  <p className="mt-4 max-w-lg leading-7 text-muted-foreground">
                    Explore its products, open-source work, and hiring from
                    India. The report will bring together public evidence and
                    the links worth keeping.
                  </p>
                  {!active && (
                    <Button
                      className="mt-6"
                      disabled={busy}
                      onClick={() => mutate.mutate({})}
                    >
                      Research company
                      <ArrowUpRight />
                    </Button>
                  )}
                </div>
              )}
              {!active && latestRun?.draft && latestRun.error && (
                <Collapsible className="my-6 rounded-lg border p-4">
                  <CollapsibleTrigger className="text-sm text-muted-foreground">
                    View unfinished draft · citations not verified
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ResearchMarkdown
                      text={latestRun.draft}
                      sources={data.sources}
                    />
                  </CollapsibleContent>
                </Collapsible>
              )}
              {!!reportSources.length && (
                <Collapsible className="mt-6 border-t pt-3">
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ChevronDown className="size-3" />
                    Sources · {reportSources.length}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <Sources sources={reportSources} />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </article>
          </div>
        </section>
        {chatCollapsed && (
          <div className="hidden shrink-0 border-l px-1 py-2 lg:block">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Expand company chat"
              onClick={() => setChatCollapsed(false)}
            >
              <PanelRightOpen className="size-4" />
            </Button>
          </div>
        )}
        <aside
          aria-label={`Questions about ${owner.name}`}
          className={`${chatCollapsed ? "hidden" : view === "chat" ? "flex lg:flex" : "hidden lg:flex"} min-h-0 w-full shrink-0 flex-col border-l bg-card/40 lg:w-[360px] xl:w-[410px]`}
        >
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-xs font-semibold">
              Ask about {owner.name}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-6"
              aria-label="Collapse company chat"
              onClick={() => {
                setChatCollapsed(true);
                setView("report");
              }}
            >
              <PanelRightClose className="size-3.5" />
            </Button>
          </div>
          <div
            ref={timeline}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            {!data.messages.length && (
              <div className="space-y-3 py-5">
                <p className="text-sm text-muted-foreground">
                  A quick clarification?
                </p>
                {[
                  "Can I work for them from India?",
                  "Which products are open source?",
                  "Where can I find engineering roles?",
                ].map((question) => (
                  <button
                    key={question}
                    disabled={busy}
                    onClick={() =>
                      mutate.mutate({
                        suffix: "/questions",
                        body: { question, webSearch: false },
                      })
                    }
                    className="block w-full rounded-lg border px-3 py-3 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-5">
              {data.messages.map((message) => {
                const messageRun = data.runs.find(
                  (r) => r.id === message.runId,
                );
                return (
                  <div key={message.id} className="space-y-3">
                    <div className="ml-6 rounded-xl rounded-tr-sm border bg-secondary/70 px-3 py-2">
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wide">
                          You
                        </span>
                        <time className="ml-auto">
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                        <CopyMessage
                          text={message.question}
                          label="Copy question"
                        />
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.question}
                      </p>
                    </div>
                    <div className="mr-3 rounded-xl rounded-tl-sm border border-border/60 bg-background/70 px-3 py-2">
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wide text-brand">
                          Assistant
                        </span>
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
                        <div className="mt-4 space-y-4">
                          {status}
                          {draft && (
                            <ResearchMarkdown
                              text={draft}
                              sources={data.sources}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="mt-3">
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
          <div className="shrink-0 border-t p-2.5">
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
        </aside>
      </div>
    </div>
  );
}
