import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  companyListSchema,
  companyDetailSchema,
  companySearchSchema,
  companySchema,
} from "@surface/contracts";
import { HeaderActions } from "@/components/layout/header-actions";
import { Button } from "@/components/ui/button";
import { CompanyMark } from "@/components/ui/company-mark";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { LoadingRows } from "@/components/feedback/loading-state";
import { useReaderLayout } from "@/features/jobs/hooks/use-reader-layout";
import { apiClient } from "@/lib/api-client";
import {
  hasOpenOverlay,
  shouldCloseJobReader as shouldCloseReader,
} from "@/lib/workspace-keyboard";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Plus,
  Play,
  Search,
  Users,
  Globe2,
  ExternalLink,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { CompanySourcesScreen } from "./company-sources-screen";
import { CompanySearches } from "./company-searches";
import { CompanyReader, type CompanyMutation } from "./company-reader";
import { companyQueues, displayDate, signalLabel } from "../company-ui";
const sourcesSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      status: z.string(),
    }),
  ),
  checks: z.array(
    z.object({
      kind: z.string(),
      state: z.string(),
      error: z.string().nullable(),
      completedAt: z.string().nullable(),
      createdAt: z.string(),
      source: z.unknown(),
    }),
  ),
});
const unresolvedSchema = z.array(
  z.object({
    workId: z.string(),
    url: z.string(),
    error: z.string().optional(),
    name: z.string().optional(),
    website: z.string().optional(),
  }),
);
export function CompaniesScreen({
  sourcesOnly = false,
}: {
  sourcesOnly?: boolean;
}) {
  return sourcesOnly ? (
    <CompanySourcesScreen sourcesOnly />
  ) : (
    <CompanyDiscoveryScreen />
  );
}
function CompanyDiscoveryScreen() {
  const client = useQueryClient(),
    [params, setParams] = useSearchParams(),
    tab = params.get("tab") || "discover",
    queue = params.get("queue") || "new",
    selected = params.get("company"),
    readerTab = params.get("reader") === "research" ? "research" : "overview",
    expanded = Boolean(selected && params.get("expanded") === "1"),
    [intake, setIntake] = useState(false),
    [csv, setCsv] = useState(""),
    [ref, layout] = useReaderLayout();
  const titleRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  useEffect(() => {
    if (!expanded && listRef.current)
      listRef.current.scrollTop = listScroll.current;
  }, [expanded]);
  const patch = (values: Record<string, string | null>) =>
    setParams(
      () => {
        const p = new URLSearchParams(window.location.search);
        for (const [k, v] of Object.entries(values)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { flushSync: true },
    );
  const restoreFocus = () => {
    const target =
      (titleRef.current?.isConnected ? titleRef.current : null) ??
      document.getElementById(`company-title-${selected}`) ??
      document.querySelector<HTMLElement>(
        'input[aria-label="Search companies"]',
      );
    target?.focus();
  };
  const close = () => {
    if (expanded) {
      patch({ expanded: null });
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>('[aria-label="Expand research"]')
          ?.focus(),
      );
      return;
    }
    patch({ company: null, reader: null, expanded: null });
    requestAnimationFrame(restoreFocus);
  };
  const urlText = params.get("q") || "";
  const [searchDraft, setSearchDraft] = useState({
    url: urlText,
    text: urlText,
  });
  if (searchDraft.url !== urlText)
    setSearchDraft({ url: urlText, text: urlText });
  const text = searchDraft.url === urlText ? searchDraft.text : urlText;
  const setText = (value: string) =>
    setSearchDraft({ url: urlText, text: value });
  useEffect(() => {
    // A Back/Forward event can arrive before a debounced navigation commits.
    // Read that history entry directly so an unsent draft cannot overwrite it.
    const restoreSearch = () => {
      const value = new URLSearchParams(window.location.search).get("q") || "";
      setSearchDraft({ url: value, text: value });
    };
    window.addEventListener("popstate", restoreSearch);
    return () => window.removeEventListener("popstate", restoreSearch);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      if (text !== (params.get("q") || ""))
        setParams(
          () => {
            const p = new URLSearchParams(window.location.search);
            if (text) p.set("q", text);
            else p.delete("q");
            p.delete("page");
            return p;
          },
          { replace: true },
        );
    }, 250);
    return () => clearTimeout(id);
  }, [text, params, setParams]);
  const query = new URLSearchParams({
    page: params.get("page") || "1",
    pageSize: "30",
  });
  for (const key of ["q", "searchId", "signal", "archived", "hasResearch"]) {
    const v = params.get(key);
    if (v) query.set(key, v);
  }
  if (tab === "watchlist") query.set("watchlist", "true");
  else query.set("queue", queue);
  const companies = useQuery({
    queryKey: ["company-opportunities", query.toString()],
    queryFn: async () =>
      companyListSchema.parse(
        await apiClient(`/api/company-discovery/opportunities?${query}`),
      ),
    refetchInterval: 10000,
  });
  const searches = useQuery({
    queryKey: ["company-searches"],
    queryFn: async () =>
      companySearchSchema
        .array()
        .parse(await apiClient("/api/company-discovery/searches")),
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ["company-detail", selected],
    queryFn: async () =>
      companyDetailSchema.parse(
        await apiClient(`/api/company-discovery/companies/${selected}`),
      ),
    enabled: Boolean(selected),
    refetchInterval: (q) => (q.state.data?.enrichmentPending ? 2000 : 10000),
  });
  const sources = useQuery({
    queryKey: ["company-discovery-sources"],
    queryFn: async () =>
      sourcesSchema.parse(await apiClient("/api/company-discovery/sources")),
    enabled: tab === "sources",
    refetchInterval: 10000,
  });
  const unresolved = useQuery({
    queryKey: ["company-unresolved"],
    queryFn: async () =>
      unresolvedSchema.parse(
        await apiClient("/api/company-discovery/unresolved"),
      ),
    refetchInterval: 10000,
  });
  const allCompanies = useQuery({
    queryKey: ["companies"],
    queryFn: async () =>
      companySchema.array().parse(await apiClient("/api/companies")),
    enabled: Boolean(unresolved.data?.length),
  });
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) => apiClient(path, { method, body: JSON.stringify(body ?? {}) }),
    onSuccess: async (result, variables) => {
      await Promise.all(
        [
          "company-opportunities",
          "company-searches",
          "company-detail",
          "company-discovery-sources",
          "company-unresolved",
          "runs",
          "companies",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      const run = result as { runId?: string };
      toast.success(
        run?.runId
          ? "Background work queued · follow progress in Activity"
          : variables.path.endsWith("/actions")
            ? "Action recorded"
            : "Changes saved",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const mutate: CompanyMutation = (v) => action.mutateAsync(v);
  useEffect(() => {
    if (selected)
      void apiClient(`/api/company-discovery/companies/${selected}/open`, {
        method: "POST",
        body: "{}",
      })
        .then(() =>
          client.invalidateQueries({ queryKey: ["company-detail", selected] }),
        )
        .catch(() => {});
  }, [selected, client]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        shouldCloseReader(e, Boolean(selected), layout.split, hasOpenOverlay())
      )
        close();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  });
  const run = (id: string) =>
    action.mutate({ path: `/api/company-discovery/searches/${id}/run` });
  const reader = detail.isPending ? (
    <div className="p-4">
      <LoadingRows label="Loading company" count={4} />
    </div>
  ) : detail.error ? (
    <div className="p-4" role="alert">
      <p>{detail.error.message}</p>
      <Button
        className="mt-3"
        variant="outline"
        onClick={() => void detail.refetch()}
      >
        Try again
      </Button>
      <Button variant="ghost" onClick={close}>
        Close
      </Button>
    </div>
  ) : detail.data ? (
    <CompanyReader
      key={detail.data.id}
      company={detail.data}
      onClose={close}
      mutate={mutate}
      pending={action.isPending}
      readerTab={readerTab}
      onReaderTabChange={(nextReader) =>
        patch({ reader: nextReader === "research" ? "research" : null })
      }
      expanded={expanded}
      onExpand={
        layout.split
          ? () => {
              listScroll.current = listRef.current?.scrollTop ?? 0;
              patch({ reader: "research", expanded: "1" });
            }
          : undefined
      }
    />
  ) : null;
  const active = searches.data?.filter((s) => !s.paused) ?? [],
    next = active
      .map((s) => s.nextRunAt)
      .filter((s): s is string => Boolean(s))
      .toSorted()[0];
  return (
    <section
      ref={ref}
      className="company-workspace"
      aria-label="Companies workspace"
    >
      <HeaderActions>
        <div className="company-workspace-actions">
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending || !active.length}
            onClick={() => {
              for (const s of active) run(s.id);
            }}
          >
            <Play />
            Run now
          </Button>
          <Button
            size="sm"
            aria-label="Add company"
            onClick={() => setIntake(true)}
          >
            <Plus />
            <span className="company-add-label">Add company</span>
          </Button>
        </div>
      </HeaderActions>
      <nav
        className={`company-tabs ${expanded ? "hidden" : ""}`}
        aria-label="Companies"
      >
        <div
          role="tablist"
          tabIndex={-1}
          aria-label="Company workspaces"
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              ),
            );
            const index = buttons.indexOf(event.target as HTMLButtonElement);
            const nextTab =
              event.key === "ArrowRight"
                ? (index + 1) % buttons.length
                : event.key === "ArrowLeft"
                  ? (index + buttons.length - 1) % buttons.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : null;
            if (nextTab === null || index < 0) return;
            event.preventDefault();
            buttons[nextTab]?.focus();
            buttons[nextTab]?.click();
          }}
        >
          {[
            { id: "discover", label: "Discover" },
            { id: "searches", label: "Searches" },
            { id: "watchlist", label: "Watchlist" },
            { id: "sources", label: "Sources" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`company-tab-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              aria-controls="company-tab-panel"
              aria-selected={tab === t.id}
              className={tab === t.id ? "selected" : ""}
              onClick={() =>
                patch({
                  tab: t.id,
                  company: null,
                  page: null,
                  archived: null,
                  expanded: null,
                  reader: null,
                })
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"
          to="/activity"
        >
          Activity
          <ExternalLink className="size-3" />
        </Link>
      </nav>
      <div className="company-workspace-body">
        <div
          ref={listRef}
          className={`company-main ${expanded ? "hidden" : ""}`}
          onScroll={(e) => {
            if (!expanded) listScroll.current = e.currentTarget.scrollTop;
          }}
          id="company-tab-panel"
          role="tabpanel"
          aria-labelledby={`company-tab-${tab}`}
        >
          {(tab === "discover" || tab === "watchlist") && (
            <>
              <header className="mb-4">
                <h1 className="text-lg font-semibold">
                  {params.get("archived") === "true"
                    ? "Archived companies"
                    : tab === "watchlist"
                      ? "Companies you’re watching"
                      : "Discover companies"}
                  <span
                    className="ml-2 align-middle font-mono text-xs font-normal tabular-nums text-muted-foreground"
                    aria-live="polite"
                  >
                    {companies.data
                      ? `${companies.data.total.toLocaleString()} compan${companies.data.total === 1 ? "y" : "ies"}`
                      : "…"}
                  </span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tab === "watchlist"
                    ? "Your shortlist and companies saved for later."
                    : "Discover companies, review your shortlist, and research the ones that interest you."}
                </p>
              </header>
              <p className="mb-4 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {active.length
                  ? `${active.length} active search${active.length === 1 ? "" : "es"}`
                  : "No active searches"}
                <span>·</span>
                <span>
                  {next
                    ? `Next ${new Date(next).toLocaleString(undefined, { timeZone: "Asia/Kolkata" })} IST`
                    : "Run manually or create a daily search"}
                </span>
              </p>
              <div className="company-filters">
                <label className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Search companies"
                    placeholder="Search companies…"
                    className="pl-8"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <Select
                  value={params.get("searchId") || "all"}
                  onValueChange={(value) =>
                    patch({
                      searchId: value === "all" ? null : value,
                      page: null,
                    })
                  }
                >
                  <SelectTrigger
                    aria-label="Filter by saved company search"
                    className="min-w-32"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All searches</SelectItem>
                    {searches.data?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={params.get("signal") || "all"}
                  onValueChange={(value) =>
                    patch({
                      signal: value === "all" ? null : value,
                      page: null,
                    })
                  }
                >
                  <SelectTrigger
                    aria-label="Discovery signal"
                    className="min-w-32"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All signals</SelectItem>
                    <SelectItem value="funding">Funding</SelectItem>
                    <SelectItem value="yc">YC</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                <label className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground md:min-h-8">
                  <Checkbox
                    checked={params.get("hasResearch") === "true"}
                    onCheckedChange={(checked) =>
                      patch({
                        hasResearch: checked === true ? "true" : null,
                        queue: checked === true ? "all" : null,
                        page: null,
                      })
                    }
                  />
                  Has research
                </label>
                {tab === "discover" && (
                  <label className="mb-3 inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground md:min-h-8">
                    <Checkbox
                      checked={params.get("archived") === "true"}
                      onCheckedChange={(checked) =>
                        patch({
                          archived: checked === true ? "true" : null,
                          page: null,
                          company: null,
                        })
                      }
                    />
                    Show archived companies
                  </label>
                )}
              </div>
              {tab === "discover" && params.get("archived") !== "true" && (
                <div
                  className="company-queue-tabs"
                  aria-label="Decision queues"
                >
                  {companyQueues.map((q) => (
                    <button
                      key={q.id}
                      aria-pressed={queue === q.id}
                      onClick={() =>
                        patch({ queue: q.id, page: null, company: null })
                      }
                    >
                      {q.label}
                      <span>{companies.data?.counts[q.id] ?? "—"}</span>
                    </button>
                  ))}
                </div>
              )}
              {companies.isPending && (
                <LoadingRows label="Loading companies" count={6} />
              )}
              {companies.error && (
                <div role="alert" className="company-empty">
                  <p>{companies.error.message}</p>
                  <Button
                    variant="outline"
                    onClick={() => void companies.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              )}
              {companies.data && (
                <>
                  <div
                    className="company-table"
                    role="table"
                    aria-label="Company opportunities"
                  >
                    <div role="row" className="company-table-head">
                      <span role="columnheader">Company</span>
                      <span role="columnheader">Discovery signal</span>
                      <span role="columnheader">Hiring & contacts</span>
                      <span role="columnheader">Found</span>
                    </div>
                    {companies.data.items.map((c) => (
                      <div
                        key={c.id}
                        role="row"
                        className={`company-opportunity-row ${c.id === selected ? "selected" : ""}`}
                      >
                        <div role="cell" className="company-identity">
                          <CompanyMark
                            name={c.name}
                            src={c.logoPath}
                            company={c}
                            fallback="none"
                            className="size-9"
                          />
                          <div className="min-w-0">
                            <button
                              className="company-title"
                              id={`company-title-${c.id}`}
                              aria-expanded={c.id === selected}
                              onClick={(e) => {
                                titleRef.current = e.currentTarget;
                                patch({ company: c.id, reader: null });
                              }}
                            >
                              {c.name}
                            </button>
                            <p className="company-row-description">
                              {c.description ||
                                c.normalizedWebsite ||
                                (c.website
                                  ? new URL(c.website).hostname
                                  : "Description not yet collected")}
                            </p>
                            {c.research.state !== "none" && (
                              <button
                                className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground hover:text-brand"
                                aria-label={`Open research for ${c.name}`}
                                onClick={() =>
                                  patch({ company: c.id, reader: "research" })
                                }
                              >
                                <BookOpen className="size-3" />
                                {c.research.state === "running"
                                  ? "Researching…"
                                  : c.research.reportCount
                                    ? "Report saved"
                                    : "Research incomplete"}
                              </button>
                            )}
                          </div>
                        </div>
                        <div role="cell" className="company-row-signals">
                          {c.signals.slice(0, 2).map((s) => (
                            <span
                              key={s.id}
                              className={`status-pill ${s.kind === "yc" ? "company-yc-badge" : "tone-muted"}`}
                            >
                              {signalLabel(s)}
                            </span>
                          ))}
                          {c.signals.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{c.signals.length - 2} signals
                            </span>
                          )}
                        </div>
                        <div
                          role="cell"
                          className="text-xs text-muted-foreground"
                        >
                          <p>
                            {c.jobCount
                              ? `${c.jobCount} open role${c.jobCount === 1 ? "" : "s"}`
                              : "No openings confirmed"}
                          </p>
                          {c.contactCount > 0 && (
                            <p className="mt-1 inline-flex items-center gap-1">
                              <Users className="size-3" />
                              {c.contactCount} contacts
                            </p>
                          )}
                        </div>
                        <div
                          role="cell"
                          className="text-xs text-muted-foreground"
                        >
                          {displayDate(c.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!companies.data.items.length && (
                    <div className="company-empty">
                      <Building2 />
                      <h2>
                        {text ||
                        params.get("searchId") ||
                        params.get("hasResearch")
                          ? "No matching companies"
                          : "Nothing here yet"}
                      </h2>
                      <p>
                        {params.get("hasResearch") === "true"
                          ? "No saved reports match these filters. Open a company’s Research tab and choose Run research to create one."
                          : tab === "watchlist"
                            ? "Choose Will apply or Later in a company’s reader to add it here."
                            : queue === "new"
                              ? "Create a saved search or add a company URL to start discovering."
                              : "Review a company in New to add it to this queue."}
                      </p>
                      {queue === "new" &&
                        params.get("hasResearch") !== "true" && (
                          <Button
                            variant="outline"
                            onClick={() => setIntake(true)}
                          >
                            <Plus />
                            Add company
                          </Button>
                        )}
                    </div>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{companies.data.total} companies</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Previous company page"
                        disabled={companies.data.page <= 1}
                        onClick={() =>
                          patch({ page: String(companies.data!.page - 1) })
                        }
                      >
                        <ArrowLeft />
                      </Button>
                      <span>Page {companies.data.page}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Next company page"
                        disabled={
                          companies.data.page * companies.data.pageSize >=
                          companies.data.total
                        }
                        onClick={() =>
                          patch({ page: String(companies.data!.page + 1) })
                        }
                      >
                        <ArrowRight />
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {Boolean(unresolved.data?.length) && (
                <details className="mt-5 rounded-md border p-3">
                  <summary className="cursor-pointer text-sm text-warning">
                    {unresolved.data!.length} discoveries need confirmation
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Confirm the official website and choose an existing company
                    only when it is the same business.
                  </p>
                  {unresolved.data?.slice(0, 10).map((u) => (
                    <form
                      key={`${u.workId}:${u.url}`}
                      className="mt-4 space-y-2 border-t pt-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = new FormData(e.currentTarget);
                        action.mutate({
                          path: "/api/company-discovery/resolve",
                          body: {
                            workId: u.workId,
                            url: u.url,
                            website: d.get("website"),
                            companyId:
                              d.get("companyId") === "auto"
                                ? undefined
                                : d.get("companyId") || undefined,
                          },
                        });
                      }}
                    >
                      <a
                        className="block truncate text-xs text-brand"
                        href={u.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {u.name || u.url}
                      </a>
                      <p className="break-words text-xs text-muted-foreground">
                        {u.error}
                      </p>
                      <label className="company-field">
                        Confirmed website
                        <Input
                          type="url"
                          name="website"
                          required
                          defaultValue={u.website}
                        />
                      </label>
                      <label className="company-field">
                        Existing company · optional
                        <Select name="companyId" defaultValue="auto">
                          <SelectTrigger aria-label="Existing company · optional">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              Match by confirmed website / create company
                            </SelectItem>
                            {allCompanies.data?.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name} · {c.website}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <Button size="sm" disabled={action.isPending}>
                        Confirm company
                      </Button>
                    </form>
                  ))}
                </details>
              )}
            </>
          )}
          {tab === "searches" &&
            (searches.isPending ? (
              <LoadingRows label="Loading company searches" count={3} />
            ) : searches.error ? (
              <p role="alert">{searches.error.message}</p>
            ) : (
              <CompanySearches searches={searches.data ?? []} onRun={run} />
            ))}
          {tab === "sources" && (
            <section className="space-y-5">
              <div>
                <h1 className="text-lg font-semibold">Discovery sources</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Public evidence, collection status, and connected job sources.
                </p>
              </div>
              {sources.isPending && (
                <LoadingRows label="Loading discovery sources" count={3} />
              )}{" "}
              {sources.error && <p role="alert">{sources.error.message}</p>}
              <div className="divide-y border-y">
                {sources.data?.sources.map((s) => (
                  <article className="flex items-start gap-3 py-4" key={s.id}>
                    <Globe2 className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold">{s.name}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {s.description}
                      </p>
                    </div>
                    <span
                      className={`status-pill ${s.status === "available" ? "tone-mint" : "tone-muted"}`}
                    >
                      {s.status === "available"
                        ? "Available"
                        : "Not configured"}
                    </span>
                  </article>
                ))}
              </div>
              <h2 className="text-sm font-semibold">
                Recent discovery & enrichment checks
              </h2>
              {!sources.data?.checks.length && (
                <p className="text-sm text-muted-foreground">
                  No collection checks yet.
                </p>
              )}
              {sources.data?.checks.slice(0, 8).map((s, i) => (
                <details
                  key={`${s.createdAt}:${i}`}
                  className="border-b pb-3 text-xs"
                >
                  <summary className="cursor-pointer">
                    {s.kind.replaceAll("-", " ")} · {s.state} ·{" "}
                    {displayDate(s.completedAt || s.createdAt)}
                  </summary>
                  {s.error && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-warning">
                      {s.error}
                    </p>
                  )}
                </details>
              ))}
              <CompanySourcesScreen sourcesOnly />
            </section>
          )}
        </div>
        {selected && (layout.split || expanded) && (
          <>
            {!expanded && (
              <div
                role="separator"
                tabIndex={0}
                aria-label="Resize company reader"
                aria-orientation="vertical"
                aria-valuemin={420}
                aria-valuemax={Math.round(layout.max)}
                aria-valuenow={Math.round(layout.width)}
                className="company-reader-divider"
                {...{
                  onPointerDown: layout.onPointerDown,
                  onPointerMove: layout.onPointerMove,
                  onPointerUp: layout.onPointerUp,
                  onLostPointerCapture: layout.onLostPointerCapture,
                  onKeyDown: layout.onKeyDown,
                }}
              />
            )}
            <aside
              className={`company-reader ${expanded ? "company-reader-expanded" : ""}`}
              style={{ width: expanded ? "100%" : layout.width }}
              aria-labelledby="company-reader-title"
            >
              {reader}
            </aside>
          </>
        )}
      </div>
      <Sheet
        open={Boolean(selected) && layout.ready && !layout.split && !expanded}
        onOpenChange={(open) => !open && close()}
      >
        <SheetContent
          className="company-reader-sheet w-full max-w-none p-0 sm:max-w-none"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(restoreFocus);
          }}
        >
          <SheetTitle className="sr-only">Company reader</SheetTitle>
          <SheetDescription className="sr-only">
            Company evidence, contacts, jobs, and your decisions.
          </SheetDescription>
          {reader}
        </SheetContent>
      </Sheet>
      <Dialog open={intake} onOpenChange={setIntake}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add companies</DialogTitle>
            <DialogDescription>
              Paste company websites, YC profiles, or funding announcement URLs.
              Surface collects evidence in the background.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void mutate({
                path: "/api/company-discovery/intake",
                body: {
                  urls: String(d.get("urls") || "")
                    .split(/\s+/)
                    .filter(Boolean),
                  csv,
                },
              })
                .then(() => {
                  setIntake(false);
                  setCsv("");
                })
                .catch(() => {});
            }}
          >
            <label className="company-field">
              Public URLs
              <Textarea
                name="urls"
                rows={5}
                placeholder="https://company.com&#10;https://www.ycombinator.com/companies/company"
              />
            </label>
            <label className="company-field">
              Or import a CSV
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 250000) {
                      toast.error("CSV must be under 250 KB");
                      return;
                    }
                    void f.text().then(setCsv);
                  }
                }}
              />
              <span>
                Use a website, url, company_url, or announcement_url column. Up
                to 100 URLs.
              </span>
            </label>
            {csv && (
              <p className="text-xs text-muted-foreground">
                CSV ready to import
              </p>
            )}
            <Button disabled={action.isPending}>
              {action.isPending ? (
                <RefreshCw className="animate-spin" />
              ) : (
                <Plus />
              )}
              Add to discovery
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
