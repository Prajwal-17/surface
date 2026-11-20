import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  Play,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Sparkles,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import {
  companyTypesCatalog,
  discoveryCriteriaLabels,
  exclusionsCatalog,
  geographiesCatalog,
  industriesCatalog,
  isDiscoveryCriteria,
  seedSourcesCatalog,
  signalsCatalog,
  type CatalogOption,
  type DiscoveryCriteria,
  type SeedSource,
} from "@surface/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multiselect";
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
  type DiscoveryRun,
  type RunDetails,
  type RunEvent,
  type SearxngDockerStatus,
  isRunActive,
  parseRunCriteria,
  useCancelRun,
  useCheckSearxng,
  useCreateDiscoveryRun,
  useLeadRuns,
  useLeadSettings,
  useRunDetails,
  useSaveLeadSettings,
  useSearxngDockerStatus,
  useStartSearxngDocker,
  useStopSearxngDocker,
} from "@/features/leads/leads-query";

const blankCriteria: DiscoveryCriteria = {
  goal: "",
  industries: [],
  geographies: [],
  companyTypes: [],
  signals: [],
  exclusions: [],
  seedSources: [],
  limit: 5,
};

const hiddenRowsKey = "surface.leads.hidden-rows";

type RowId = "seeds" | "who" | "signals" | "exclusions" | "goal";

const defaultHiddenRows: Partial<Record<RowId, boolean>> = { goal: true };

function loadHiddenRows(): Partial<Record<RowId, boolean>> {
  try {
    const raw = localStorage.getItem(hiddenRowsKey);
    if (!raw) return defaultHiddenRows;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultHiddenRows;
    return parsed as Partial<Record<RowId, boolean>>;
  } catch {
    return defaultHiddenRows;
  }
}

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

function dockerStatusLabel(status: SearxngDockerStatus | undefined) {
  if (!status) return "Checking Docker…";
  if (!status.dockerAvailable) return "Docker unavailable";
  if (!status.exists) return "Container not created yet";
  switch (status.state) {
    case "running":
      return status.health ? `Running · ${status.health}` : "Running";
    case "restarting":
      return "Restarting";
    case "paused":
      return "Paused";
    case "stopped":
    case "exited":
      return "Stopped";
    default:
      return "Unknown state";
  }
}

export function FindLeadsWorkspace() {
  const queryClient = useQueryClient();
  const settingsQuery = useLeadSettings();
  const runsQuery = useLeadRuns();
  const createRun = useCreateDiscoveryRun();
  const [criteria, setCriteria] = useState<DiscoveryCriteria>(blankCriteria);
  const [hiddenRows, setHiddenRows] = useState<Partial<Record<RowId, boolean>>>(
    loadHiddenRows,
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [view, setView] = useState<"form" | "history" | "detail">("form");
  const runs = runsQuery.data ?? [];
  const effectiveRunId = selectedRunId;
  const selectedRun = useRunDetails(effectiveRunId);
  const activeRun = runs.find((run) => isRunActive(run));

  useEffect(() => {
    try {
      localStorage.setItem(hiddenRowsKey, JSON.stringify(hiddenRows));
    } catch {
      // Private-mode storage may reject writes; layout persistence is a
      // convenience, not a requirement.
    }
  }, [hiddenRows]);

  const completedRunId = selectedRun.data?.run.id;
  const completedState = selectedRun.data?.run.state;
  useEffect(() => {
    if (!completedRunId || completedState !== "completed") return;
    void queryClient.invalidateQueries({ queryKey: ["tracker"] });
  }, [completedRunId, completedState, queryClient]);

  const criteriaComplete = Boolean(
    criteria.industries.length ||
      criteria.geographies.length ||
      criteria.companyTypes.length ||
      criteria.signals.length,
  );
  const canStart =
    criteriaComplete &&
    Boolean(settingsQuery.data?.searxngUrl.trim()) &&
    !createRun.isPending;

  function toggleRow(rowId: RowId) {
    setHiddenRows((rows) => ({ ...rows, [rowId]: !rows[rowId] }));
  }

  function setSeedSources(ids: string[]) {
    setCriteria((current) => ({
      ...current,
      seedSources: ids.slice(0, 5).map((id): SeedSource => {
        const preset = seedSourcesCatalog.options.find(
          (option) => option.id === id,
        );
        return {
          domain: preset?.domain ?? id.toLowerCase().replace(/^www\./, ""),
          mode: preset?.mode ?? "search",
          id: preset ? preset.id : undefined,
        };
      }),
    }));
  }

  function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStart) return;
    createRun.mutate(criteria, {
      onSuccess: (run) => {
        setSelectedRunId(run.id);
        setView("detail");
        toast.success("Discovery run started");
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-3 pt-4 pb-2 sm:px-4">
      {settingsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Could not load lead settings: {settingsQuery.error.message}
        </p>
      ) : null}

      <div className="mt-4 flex gap-5 border-b" aria-label="Discovery views">
        <button type="button" onClick={() => setView("form")} aria-current={view === "form" ? "page" : undefined} className={`border-b-2 pb-2 text-sm ${view === "form" ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground"}`}>New discovery</button>
        <button type="button" onClick={() => setView("history")} aria-current={view !== "form" ? "page" : undefined} className={`border-b-2 pb-2 text-sm ${view !== "form" ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground"}`}>Run history</button>
        {activeRun ? (
          <Badge variant="outline" className="status-pill tone-blue ml-auto mb-2 gap-1.5">
            <LoaderCircle className="size-3 animate-spin" />A run is active
          </Badge>
        ) : null}
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-4">
        {view === "form" ? <div className="space-y-4">
          {settingsQuery.data ? (
            <LeadSettingsCard settings={settingsQuery.data} />
          ) : settingsQuery.isLoading ? (
            <Skeleton className="h-36 w-full rounded-lg" />
          ) : null}

          <form
            onSubmit={startRun}
            className="rounded-lg border bg-card"
            aria-labelledby="discovery-criteria-heading"
          >
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <h2
                id="discovery-criteria-heading"
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <Search className="size-4 text-brand" />
                Discovery criteria
              </h2>
            </div>

            <div className="grid gap-4 px-4 py-4">
              <CriteriaRow
                label="Where to look"
                hidden={hiddenRows.seeds}
                summary={
                  criteria.seedSources.length
                    ? `${criteria.seedSources.length} source${criteria.seedSources.length === 1 ? "" : "s"}`
                    : ""
                }
                onToggle={() => toggleRow("seeds")}
              >
                <MultiSelect
                  options={seedSourcesCatalog.options.map((option) => ({
                    id: option.id,
                    label: option.label,
                    hint:
                      option.mode === "search"
                        ? "Search inside this site"
                        : "Fetch its listing pages",
                  }))}
                  value={criteria.seedSources.map(
                    (source) => source.id ?? source.domain,
                  )}
                  onChange={setSeedSources}
                  ariaLabel="Seed sources"
                  placeholder="Add source"
                  maxValues={5}
                  align="start"
                />
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Known directories the agent searches or reads first. Leave
                  empty to let it choose its own searches.
                </p>
              </CriteriaRow>

              <CriteriaRow
                label="Who"
                hidden={hiddenRows.who}
                summary={whoSummary(criteria)}
                onToggle={() => toggleRow("who")}
              >
                <div className="grid gap-3">
                  {(
                    [
                      ["Industries", "industries", industriesCatalog.options],
                      ["Geographies", "geographies", geographiesCatalog.options],
                      ["Company type", "companyTypes", companyTypesCatalog.options],
                    ] as const
                  ).map(([label, field, options]) => (
                    <div key={field} className="grid gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {label}
                      </span>
                      <MultiSelect
                        options={options as readonly CatalogOption[]}
                        value={criteria[field]}
                        onChange={(next) =>
                          setCriteria((current) => ({
                            ...current,
                            [field]: next,
                          }))
                        }
                        ariaLabel={label}
                        placeholder="Add"
                      />
                    </div>
                  ))}
                </div>
              </CriteriaRow>

              <CriteriaRow
                label="Signals"
                hidden={hiddenRows.signals}
                summary={
                  criteria.signals.length
                    ? `${criteria.signals.length} selected`
                    : ""
                }
                onToggle={() => toggleRow("signals")}
              >
                <MultiSelect
                  options={signalsCatalog.options}
                  value={criteria.signals}
                  onChange={(next) =>
                    setCriteria((current) => ({ ...current, signals: next }))
                  }
                  ariaLabel="Relevant signals"
                  placeholder="Add signal"
                />
              </CriteriaRow>

              <CriteriaRow
                label="Exclusions"
                hidden={hiddenRows.exclusions}
                summary={
                  criteria.exclusions.length
                    ? `${criteria.exclusions.length} excluded`
                    : ""
                }
                onToggle={() => toggleRow("exclusions")}
              >
                <MultiSelect
                  options={exclusionsCatalog.options}
                  value={criteria.exclusions}
                  onChange={(next) =>
                    setCriteria((current) => ({
                      ...current,
                      exclusions: next,
                    }))
                  }
                  ariaLabel="Exclusions"
                  placeholder="Add exclusion"
                />
              </CriteriaRow>

              <CriteriaRow
                label="Goal (optional)"
                hidden={hiddenRows.goal}
                summary={criteria.goal.trim()}
                onToggle={() => toggleRow("goal")}
              >
                <Input
                  value={criteria.goal}
                  maxLength={500}
                  placeholder="What you want these leads for, in one line"
                  onChange={(event) =>
                    setCriteria((current) => ({
                      ...current,
                      goal: event.target.value,
                    }))
                  }
                />
              </CriteriaRow>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="grid gap-1.5 text-xs font-medium">
                  Result limit
                  <Select
                    value={String(criteria.limit)}
                    onValueChange={(value) =>
                      setCriteria({ ...criteria, limit: Number(value) })
                    }
                  >
                    <SelectTrigger aria-label="Result limit" className="w-32">
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
                <Button type="submit" disabled={!canStart}>
                  {createRun.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  {createRun.isPending ? "Starting…" : "Start discovery run"}
                </Button>
              </div>
              {!settingsQuery.data?.searxngUrl.trim() ? (
                <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  Add a SearXNG instance URL in the settings above before
                  starting a run.
                </p>
              ) : null}
            </div>
          </form>

        </div> : view === "history" ? (
          <RunHistory
            runs={runs}
            loading={runsQuery.isLoading}
            error={runsQuery.error}
            selectedRunId={null}
            onSelect={(id) => { setSelectedRunId(id); setView("detail"); }}
          />
        ) : (
          <div className="space-y-4">
            <Button variant="outline" size="sm" onClick={() => setView("history")}>← Run history</Button>
            <RunDetailsCard
              runId={effectiveRunId}
              details={selectedRun.data}
              loading={selectedRun.isLoading}
              error={selectedRun.error}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function whoSummary(criteria: DiscoveryCriteria) {
  const total =
    criteria.industries.length +
    criteria.geographies.length +
    criteria.companyTypes.length;
  if (!total) return "";
  return `${total} criteri${total === 1 ? "on" : "a"} selected`;
}

/**
 * One form row with a Hide control. A hidden row with values collapses to a
 * single summary line; a hidden empty row disappears entirely.
 */
function CriteriaRow({
  label,
  hidden,
  summary,
  onToggle,
  children,
}: {
  label: string;
  hidden: boolean | undefined;
  summary: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (hidden && !summary) return null;
  if (hidden) {
    return (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="font-medium text-foreground">{label}</span>
          <span className="ml-2 truncate text-muted-foreground">{summary}</span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Show
        </button>
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Hide
        </button>
      </div>
      {children}
    </div>
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
  const dockerStatus = useSearxngDockerStatus(open);
  const startDocker = useStartSearxngDocker();
  const stopDocker = useStopSearxngDocker();
  const docker = dockerStatus.data;
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

  function startLocalDocker() {
    startDocker.mutate(undefined, {
      onSuccess: (status) => {
        setSearxngUrl(status.url);
        toast.success("Local SearXNG started");
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function stopLocalDocker() {
    stopDocker.mutate(undefined, {
      onSuccess: () => toast.success("Local SearXNG stopped"),
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
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Server className="size-4 text-brand" />
                    Local Docker SearXNG
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dockerStatusLabel(docker)}
                    {docker?.dockerVersion
                      ? ` · Docker ${docker.dockerVersion}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Refresh Docker status"
                    title="Refresh Docker status"
                    disabled={dockerStatus.isFetching}
                    onClick={() => void dockerStatus.refetch()}
                  >
                    <RefreshCw
                      className={
                        dockerStatus.isFetching ? "animate-spin" : undefined
                      }
                    />
                  </Button>
                  {docker?.running ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={stopDocker.isPending}
                      onClick={stopLocalDocker}
                    >
                      {stopDocker.isPending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Square />
                      )}
                      {stopDocker.isPending ? "Stopping…" : "Stop"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      disabled={
                        !docker?.dockerAvailable ||
                        dockerStatus.isLoading ||
                        startDocker.isPending
                      }
                      onClick={startLocalDocker}
                    >
                      {startDocker.isPending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Play />
                      )}
                      {startDocker.isPending ? "Starting…" : "Start"}
                    </Button>
                  )}
                </div>
              </div>
              {dockerStatus.isError ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  Could not check Docker: {dockerStatus.error.message}
                </p>
              ) : null}
              {docker?.error ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  {docker.error}
                </p>
              ) : null}
              {docker?.dockerAvailable && !docker.exists ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Start creates the container on port 8080 and pulls the image
                  if it is not already installed. The first start can take a
                  minute.
                </p>
              ) : null}
              {docker?.running ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Local search is available at{" "}
                  <span className="font-mono">{docker.url}</span>. Starting also
                  updates the saved instance URL.
                </p>
              ) : null}
            </div>
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
              const criteriaLabel =
                criteria && isDiscoveryCriteria(criteria)
                  ? (criteria.industries[0] ??
                    criteria.geographies[0] ??
                    criteria.companyTypes[0] ??
                    criteria.signals[0] ??
                    criteria.seedSources[0]?.domain ??
                    "criteria")
                  : null;
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
                      {criteriaLabel && run.kind === "discovery"
                        ? ` · ${criteriaLabel}`
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

function sourceEventRendered(event: RunEvent) {
  try {
    return Boolean(
      (JSON.parse(event.metadata ?? "{}") as { rendered?: boolean })
        .rendered,
    );
  } catch {
    return false;
  }
}

/**
 * One factual line of live counts. Counts come from run events and persisted
 * counters, never from generated prose.
 */
function ProgressStrip({ run, events }: { run: DiscoveryRun; events: RunEvent[] }) {
  const searches = events.filter((event) => event.kind === "search").length;
  const pages = events.filter((event) => event.kind === "source").length;
  const rendered = events.filter(sourceEventRendered).length;
  const active = isRunActive(run);
  const stateWord = active
    ? run.state === "queued"
      ? "Queued"
      : "Searching"
    : runStateLabel(run.state);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
      <span
        className={`inline-flex items-center gap-1.5 ${active ? "text-brand" : ""}`}
      >
        {active ? <LoaderCircle className="size-3 animate-spin" /> : null}
        {stateWord}
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {Math.min(searches, 6)}/6 searches
      </span>
      <span aria-hidden="true">·</span>
      <span>{Math.min(pages, 10)}/10 pages</span>
      <span aria-hidden="true">·</span>
      <span>
        {run.resultCount} saved
      </span>
      <span aria-hidden="true">·</span>
      <span>{run.skippedCount} skipped</span>
      {rendered > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{rendered} rendered</span>
        </>
      ) : null}
    </p>
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
  const criteriaChips =
    run.kind === "discovery" && criteria && isDiscoveryCriteria(criteria)
      ? discoveryCriteriaLabels(criteria)
      : [];

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
        {run.kind === "discovery" ? (
          <ProgressStrip run={run} events={events} />
        ) : (
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
        )}
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

        {criteriaChips.length ? (
          <div className="flex flex-wrap gap-1.5">
            {criteriaChips.map((value) => (
              <Badge
                key={value}
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
                    {lead.status ? (
                      <Badge
                        variant="outline"
                        className={`status-pill ${
                          lead.status === "Lead"
                            ? "tone-blue"
                            : lead.status === "Research"
                              ? "tone-mint"
                              : ""
                        }`}
                      >
                        {lead.status}
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
