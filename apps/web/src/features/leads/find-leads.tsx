import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  CircleSlash,
  Clock3,
  ExternalLink,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type DiscoveryCriteria,
  type DiscoveryRun,
  type RunDetails,
  isRunActive,
  parseRunCriteria,
  useCancelRun,
  useCheckSearxng,
  useCreateDiscoveryRun,
  useLeadRuns,
  useLeadSettings,
  useRunDetails,
  useSaveLeadSettings,
} from "@/features/leads/leads-query";

const blankCriteria: DiscoveryCriteria = {
  industry: "",
  geography: "",
  companyType: "",
  signals: "",
  exclusions: "",
  limit: 5,
};

function runStateLabel(state: DiscoveryRun["state"]) {
  switch (state) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function runStateTone(state: DiscoveryRun["state"]) {
  if (state === "completed") return "tone-mint";
  if (state === "running" || state === "queued") return "tone-blue";
  if (state === "failed") return "tone-rose";
  return "tone-muted";
}

function websiteLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function FindLeadsWorkspace() {
  const queryClient = useQueryClient();
  const settingsQuery = useLeadSettings();
  const runsQuery = useLeadRuns();
  const createRun = useCreateDiscoveryRun();
  const [criteria, setCriteria] = useState<DiscoveryCriteria>(blankCriteria);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const runs = runsQuery.data ?? [];
  const effectiveRunId = selectedRunId ?? runs[0]?.id ?? null;
  const selectedRun = useRunDetails(effectiveRunId);
  const activeRun = runs.find((run) => isRunActive(run));

  const completedRunId = selectedRun.data?.run.id;
  const completedState = selectedRun.data?.run.state;
  useEffect(() => {
    if (!completedRunId || completedState !== "completed") return;
    void queryClient.invalidateQueries({ queryKey: ["tracker"] });
  }, [completedRunId, completedState, queryClient]);

  const criteriaComplete = Boolean(
    criteria.industry.trim() ||
    criteria.geography.trim() ||
    criteria.companyType.trim() ||
    criteria.signals.trim(),
  );
  const canStart =
    criteriaComplete &&
    Boolean(settingsQuery.data?.searxngUrl.trim()) &&
    !createRun.isPending;

  function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStart) return;
    createRun.mutate(criteria, {
      onSuccess: (run) => {
        setSelectedRunId(run.id);
        toast.success("Discovery run started");
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-3 pt-4 pb-2 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Find leads</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Run a bounded web search and verification pass. Validated companies
            are added to Companies with a lead tag.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeRun ? (
            <Badge variant="outline" className="status-pill tone-blue gap-1.5">
              <LoaderCircle className="size-3 animate-spin" />A run is active
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => void runsQuery.refetch()}
            disabled={runsQuery.isFetching}
          >
            <RefreshCw className={runsQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {settingsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Could not load lead settings: {settingsQuery.error.message}
        </p>
      ) : null}

      <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-y-auto pb-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
        <div className="min-h-0 space-y-4 lg:overflow-y-auto lg:pr-1">
          {settingsQuery.data ? (
            <LeadSettingsCard
              key={settingsQuery.data.updatedAt}
              settings={settingsQuery.data}
            />
          ) : settingsQuery.isLoading ? (
            <Skeleton className="h-36 w-full rounded-lg" />
          ) : null}

          <form
            onSubmit={startRun}
            className="rounded-lg border bg-card p-4"
            aria-labelledby="discovery-criteria-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="discovery-criteria-heading"
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <Search className="size-4 text-brand" />
                  Discovery criteria
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Be specific about what makes a company a fit. The agent saves
                  only companies it can support with fetched sources.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Industry
                <Input
                  value={criteria.industry}
                  maxLength={300}
                  placeholder="e.g. B2B developer tools"
                  onChange={(event) =>
                    setCriteria({ ...criteria, industry: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Geography
                <Input
                  value={criteria.geography}
                  maxLength={300}
                  placeholder="e.g. United States or remote-first"
                  onChange={(event) =>
                    setCriteria({ ...criteria, geography: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Company size or type
                <Input
                  value={criteria.companyType}
                  maxLength={300}
                  placeholder="e.g. seed to Series B, 20–200 people"
                  onChange={(event) =>
                    setCriteria({
                      ...criteria,
                      companyType: event.target.value,
                    })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Result limit
                <Select
                  value={String(criteria.limit)}
                  onValueChange={(value) =>
                    setCriteria({ ...criteria, limit: Number(value) })
                  }
                >
                  <SelectTrigger aria-label="Result limit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 5, 8, 10, 15].map((limit) => (
                      <SelectItem key={limit} value={String(limit)}>
                        {limit} leads
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                Relevant signals
                <Textarea
                  value={criteria.signals}
                  maxLength={2000}
                  rows={3}
                  placeholder="Hiring engineers, recently raised funding, launching a developer product…"
                  onChange={(event) =>
                    setCriteria({ ...criteria, signals: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                Exclusions
                <Textarea
                  value={criteria.exclusions}
                  maxLength={2000}
                  rows={2}
                  placeholder="Agencies, consultancies, competitors…"
                  onChange={(event) =>
                    setCriteria({ ...criteria, exclusions: event.target.value })
                  }
                />
              </label>
            </div>
            {!settingsQuery.data?.searxngUrl.trim() ? (
              <p className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                Add a SearXNG instance URL above before starting a run.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {criteriaComplete
                  ? "The agent uses multiple searches and page fetches within a bounded run."
                  : "Add at least one criterion to start."}
              </p>
              <Button type="submit" disabled={!canStart}>
                {createRun.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {createRun.isPending ? "Starting…" : "Start discovery run"}
              </Button>
            </div>
          </form>

          <RunDetailsCard
            runId={effectiveRunId}
            details={selectedRun.data}
            loading={selectedRun.isLoading}
            error={selectedRun.error}
          />
        </div>

        <RunHistory
          runs={runs}
          loading={runsQuery.isLoading}
          error={runsQuery.error}
          selectedRunId={effectiveRunId}
          onSelect={setSelectedRunId}
        />
      </div>
    </main>
  );
}

function LeadSettingsCard({
  settings,
}: {
  settings: { searxngUrl: string; productContext: string };
}) {
  const [searxngUrl, setSearxngUrl] = useState(settings.searxngUrl);
  const [productContext, setProductContext] = useState(settings.productContext);
  const [open, setOpen] = useState(!settings.searxngUrl);
  const saveSettings = useSaveLeadSettings();
  const checkConnection = useCheckSearxng();
  const dirty =
    searxngUrl.trim() !== settings.searxngUrl ||
    productContext.trim() !== settings.productContext;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveSettings.mutate(
      {
        searxngUrl: searxngUrl.trim(),
        productContext: productContext.trim(),
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success("Lead discovery settings saved");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function check() {
    if (!searxngUrl.trim()) {
      toast.error("Enter a SearXNG instance URL first.");
      return;
    }
    checkConnection.mutate(searxngUrl.trim(), {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(
            `SearXNG connected. Test search returned ${result.resultCount} result${result.resultCount === 1 ? "" : "s"}.`,
          );
        } else {
          toast.error(result.error ?? "Could not connect to SearXNG.");
        }
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="size-4 text-brand" />
            Web search and offer context
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {settings.searxngUrl
              ? `SearXNG: ${settings.searxngUrl}`
              : "No SearXNG instance configured yet."}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Hide" : "Configure"}
        </span>
      </button>
      {open ? (
        <form className="border-t px-4 py-4" onSubmit={save}>
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              SearXNG instance URL
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-52 flex-1"
                  value={searxngUrl}
                  maxLength={2048}
                  placeholder="http://127.0.0.1:8080"
                  onChange={(event) => setSearxngUrl(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={check}
                  disabled={checkConnection.isPending}
                >
                  {checkConnection.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CheckCircle2 />
                  )}
                  Check connection
                </Button>
              </div>
              <span className="text-xs font-normal text-muted-foreground">
                Use a self-hosted or trusted instance. JSON output must be
                enabled on the instance.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Product or offer context
              <Textarea
                value={productContext}
                maxLength={4000}
                rows={4}
                placeholder="What you offer, who it helps, and the outcomes you can support. This is used for research and outreach drafts."
                onChange={(event) => setProductContext(event.target.value)}
              />
              <span className="text-xs font-normal text-muted-foreground">
                Stored locally. This is background for writing, not evidence
                about a company.
              </span>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {dirty ? (
              <span className="mr-auto self-center text-xs text-muted-foreground">
                Unsaved changes
              </span>
            ) : null}
            <Button type="submit" disabled={saveSettings.isPending || !dirty}>
              {saveSettings.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : null}
              {saveSettings.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function RunHistory({
  runs,
  loading,
  error,
  selectedRunId,
  onSelect,
}: {
  runs: DiscoveryRun[];
  loading: boolean;
  error: Error | null;
  selectedRunId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      aria-label="Run history"
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-brand" />
          Run history
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {runs.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <p role="alert" className="p-2 text-sm text-destructive">
            Could not load runs: {error.message}
          </p>
        ) : loading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No runs yet. Start a discovery run to find your first leads.
          </p>
        ) : (
          <ul className="space-y-1">
            {runs.map((run) => {
              const criteria = parseRunCriteria(run);
              const label =
                run.kind === "research" ? "Company research" : "Discovery";
              const detail =
                run.kind === "research"
                  ? "Sourced brief"
                  : `${run.resultCount} lead${run.resultCount === 1 ? "" : "s"}`;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(run.id)}
                    aria-current={run.id === selectedRunId ? "true" : undefined}
                    className={`w-full rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      run.id === selectedRunId
                        ? "bg-selected"
                        : "hover:bg-hover"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">
                        {label}
                      </span>
                      <Badge
                        variant="outline"
                        className={`status-pill ${runStateTone(run.state)}`}
                      >
                        {runStateLabel(run.state)}
                      </Badge>
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {detail}
                      {criteria &&
                      "industry" in criteria &&
                      run.kind === "discovery"
                        ? ` · ${criteria.industry || criteria.signals || "criteria"}`
                        : ""}
                    </span>
                    <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                      {timeLabel(run.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function RunDetailsCard({
  runId,
  details,
  loading,
  error,
}: {
  runId: string | null;
  details: RunDetails | undefined;
  loading: boolean;
  error: Error | null;
}) {
  const cancelRun = useCancelRun();
  if (!runId) {
    return (
      <section className="rounded-lg border border-dashed bg-card p-6 text-center">
        <Sparkles className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No run selected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Start a run or choose one from the history.
        </p>
      </section>
    );
  }
  if (loading && !details) {
    return <Skeleton className="h-52 w-full rounded-lg" />;
  }
  if (error && !details) {
    return (
      <p
        role="alert"
        className="rounded-lg border p-4 text-sm text-destructive"
      >
        Could not load this run: {error.message}
      </p>
    );
  }
  if (!details) return null;
  const { run, events, leads } = details;
  const criteria = parseRunCriteria(run);
  const active = isRunActive(run);
  const researchCompanyId =
    run.kind === "research" && criteria && "companyId" in criteria
      ? criteria.companyId
      : null;

  return (
    <section
      aria-labelledby="run-detail-heading"
      className="rounded-lg border bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2
            id="run-detail-heading"
            className="flex flex-wrap items-center gap-2 text-sm font-semibold"
          >
            {run.kind === "research" ? "Company research" : "Discovery run"}
            <Badge
              variant="outline"
              className={`status-pill ${runStateTone(run.state)}`}
            >
              {runStateLabel(run.state)}
            </Badge>
          </h2>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Started {timeLabel(run.startedAt ?? run.createdAt)}
            {run.completedAt ? ` · Finished ${timeLabel(run.completedAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {researchCompanyId ? (
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link to={`/companies?company=${researchCompanyId}`}>
                <ArrowUpRight /> Open company
              </Link>
            </Button>
          ) : null}
          {active ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={cancelRun.isPending}
              onClick={() =>
                cancelRun.mutate(run.id, {
                  onSuccess: () => toast.success("Run cancelled"),
                  onError: (cancelError) => toast.error(cancelError.message),
                })
              }
            >
              {cancelRun.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CircleSlash />
              )}
              Cancel run
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <div className="grid gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-success" />
              {run.resultCount}{" "}
              {run.kind === "research"
                ? "findings"
                : `lead${run.resultCount === 1 ? "" : "s"}`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              {run.skippedCount} skipped
            </span>
            {active ? (
              <span className="inline-flex items-center gap-1.5 text-brand">
                <LoaderCircle className="size-3.5 animate-spin" />
                Working…
              </span>
            ) : null}
          </div>
          {run.summary ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {run.summary}
            </p>
          ) : null}
          {run.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {run.error}
            </p>
          ) : null}
        </div>

        {run.kind === "discovery" && criteria && "limit" in criteria ? (
          <div className="flex flex-wrap gap-1.5">
            {[
              criteria.industry,
              criteria.geography,
              criteria.companyType,
              criteria.signals,
            ]
              .filter(Boolean)
              .map((value, index) => (
                <Badge
                  key={`${value}-${index}`}
                  variant="outline"
                  className="max-w-full truncate rounded-md py-1 font-normal"
                >
                  {value}
                </Badge>
              ))}
          </div>
        ) : null}

        {leads.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Leads from this run</h3>
            <ul className="divide-y rounded-md border">
              {leads.map((lead) => (
                <li
                  key={lead.id}
                  className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/companies?company=${lead.id}`}
                      className="text-sm font-medium underline-offset-4 hover:text-brand hover:underline"
                    >
                      {lead.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[lead.location, lead.website]
                        .filter(Boolean)
                        .join(" · ") || "No website or location"}
                    </p>
                    {lead.matchReason ? (
                      <p className="mt-1 text-xs leading-5 text-foreground/80">
                        {lead.matchReason}
                      </p>
                    ) : null}
                    {lead.sources.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {lead.sources.slice(0, 4).map((source) => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[11px] text-brand underline-offset-4 hover:underline"
                          >
                            <span className="truncate">
                              {source.title || websiteLabel(source.url)}
                            </span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.tags.includes("lead") ? (
                      <Badge
                        variant="outline"
                        className="status-pill tone-blue"
                      >
                        Lead
                      </Badge>
                    ) : null}
                    {lead.website ? (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex size-8 items-center justify-center rounded-md text-brand hover:bg-hover"
                        aria-label={`Open ${lead.name} website`}
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : run.kind === "discovery" && run.state === "completed" ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No companies matched this run. Try broader criteria or check the
            progress log for upstream errors.
          </p>
        ) : null}

        <div>
          <h3 className="mb-2 text-sm font-semibold">Progress</h3>
          {events.length ? (
            <ol className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
              {events.map((event) => (
                <li key={event.id} className="flex gap-2 text-xs">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  <div className="min-w-0">
                    <p className="break-words leading-5 text-foreground/90">
                      {event.message}
                    </p>
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {event.kind} · {timeLabel(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting for the run to start…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
