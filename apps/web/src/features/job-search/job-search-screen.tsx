import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Play,
  Search,
} from "lucide-react";
import {
  jobSearchRunSchema,
  jobSearchSettingsSchema,
  type JobSearchSettings,
  type JobSearchSettingsInput,
} from "@surface/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const intervals = [
  [0, "Manual only"],
  [60, "Every hour"],
  [360, "Every 6 hours"],
  [720, "Every 12 hours"],
  [1440, "Daily"],
] as const;

export function JobSearchScreen() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["job-search", "settings"],
    queryFn: async () =>
      jobSearchSettingsSchema.parse(
        await apiClient("/api/job-search/settings"),
      ),
    refetchInterval: (state) => (state.state.data?.running ? 1500 : false),
  });
  const [form, setForm] = useState<JobSearchSettingsInput | null>(null);
  useEffect(() => {
    if (!form && query.data) setForm(toInput(query.data));
  }, [form, query.data]);

  const save = useMutation({
    mutationFn: async (value: JobSearchSettingsInput) =>
      jobSearchSettingsSchema.parse(
        await apiClient("/api/job-search/settings", {
          method: "PUT",
          body: JSON.stringify(value),
        }),
      ),
    onSuccess: (value) => {
      setForm(toInput(value));
      void client.setQueryData(["job-search", "settings"], value);
      toast.success("Search preferences saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const run = useMutation({
    mutationFn: async () => {
      if (
        form &&
        query.data &&
        JSON.stringify(form) !== JSON.stringify(toInput(query.data))
      ) {
        await save.mutateAsync(form);
      }
      return jobSearchRunSchema.parse(
        await apiClient("/api/job-search/run", { method: "POST" }),
      );
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["job-search", "settings"] });
      if (result.status === "failed") toast.error("All job feeds failed");
      else if (result.status === "partial")
        toast.warning("Search finished with feed errors");
      else toast.success("Job search finished");
    },
    onError: (error) => toast.error(error.message),
  });
  const settings = query.data;
  const value = form ?? (settings ? toInput(settings) : null);

  function update(patch: Partial<JobSearchSettingsInput>) {
    setForm((current) => ({
      ...(current ?? (settings ? toInput(settings) : defaults)),
      ...patch,
    }));
  }

  if (query.isLoading)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Loading Job Search…
      </div>
    );
  if (query.error || !settings || !value)
    return (
      <div role="alert" className="p-8 text-sm text-destructive">
        {query.error?.message ?? "Job Search is unavailable."}
      </div>
    );

  const latest = settings.latestRun;
  const failedSources = latest?.sources.filter((source) => source.error) ?? [];
  const skipBreakdown = latest?.sources.reduce(
    (total, source) => ({
      duplicates: total.duplicates + source.skippedDuplicates,
      unresolvedCompanies:
        total.unresolvedCompanies + source.skippedUnresolvedCompanies,
      companyLimit: total.companyLimit + source.skippedCompanyLimit,
      applicationLimit: total.applicationLimit + source.skippedApplicationLimit,
    }),
    {
      duplicates: 0,
      unresolvedCompanies: 0,
      companyLimit: 0,
      applicationLimit: 0,
    },
  ) ?? {
    duplicates: 0,
    unresolvedCompanies: 0,
    companyLimit: 0,
    applicationLimit: 0,
  };
  const recordedSkipCount = Object.values(skipBreakdown).reduce(
    (total, count) => total + count,
    0,
  );
  const unsaved = JSON.stringify(value) !== JSON.stringify(toInput(settings));

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6 pt-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Search workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Job Search
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Search five public job feeds and save qualified postings to
            Applications. Clear employer names are saved even when a listing
            does not include a company website.
          </p>
        </div>
        <Button
          onClick={() => run.mutate()}
          disabled={run.isPending || save.isPending || settings.running}
        >
          {run.isPending || settings.running ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Play />
          )}
          {settings.running ? "Searching…" : "Run search"}
        </Button>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form
          className="space-y-5 rounded-xl border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(value);
          }}
        >
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Search preferences</h2>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Role or keywords</span>
            <Input
              value={value.query}
              maxLength={120}
              placeholder="e.g. frontend engineer, React"
              onChange={(event) => update({ query: event.target.value })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Location</span>
              <Input
                value={value.location}
                maxLength={120}
                placeholder="City, country, or region"
                onChange={(event) => update({ location: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Job type</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={value.employmentType}
                onChange={(event) =>
                  update({
                    employmentType: event.target
                      .value as JobSearchSettingsInput["employmentType"],
                  })
                }
              >
                <option value="any">Any type</option>
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
                <option value="temporary">Temporary</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.remoteOnly}
              onChange={(event) => update({ remoteOnly: event.target.checked })}
            />
            Remote roles only
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Schedule</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={value.intervalMinutes}
                onChange={(event) =>
                  update({
                    intervalMinutes: Number(event.target.value),
                    enabled: Number(event.target.value) > 0,
                  })
                }
              >
                {intervals.map(([minutes, label]) => (
                  <option key={minutes} value={minutes}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="New applications per run"
              value={value.maxApplications}
              onChange={(number) => update({ maxApplications: number })}
            />
            <NumberField
              label="New companies per run"
              value={value.maxCompanies}
              onChange={(number) => update({ maxCompanies: number })}
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Scheduled searches run while the backend is running.
            </p>
            <Button
              type="submit"
              variant="secondary"
              disabled={!unsaved || save.isPending}
            >
              {save.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : null}
              Save preferences
            </Button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="size-4 text-muted-foreground" />
              Run schedule
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Last run</dt>
                <dd className="mt-0.5">{formatTime(settings.lastRunAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Next run</dt>
                <dd className="mt-0.5">
                  {settings.nextRunAt
                    ? formatTime(settings.nextRunAt)
                    : "Manual only"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Latest results</h2>
              {latest ? (
                <span
                  className={`text-xs font-medium ${latest.status === "failed" ? "text-destructive" : latest.status === "partial" ? "text-warning" : "text-success"}`}
                >
                  {latest.status}
                </span>
              ) : null}
            </div>
            {latest ? (
              <>
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  {latest.found.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    matched
                  </span>
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {latest.insertedApplications} applications ·{" "}
                  {latest.insertedCompanies} companies · {latest.skipped}{" "}
                  skipped
                </p>
                {latest.skipped > 0 && recordedSkipCount > 0 ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {[
                      skipBreakdown.duplicates > 0 &&
                        `${skipBreakdown.duplicates} already saved`,
                      skipBreakdown.unresolvedCompanies > 0 &&
                        `${skipBreakdown.unresolvedCompanies} need a clear company match`,
                      skipBreakdown.companyLimit > 0 &&
                        `${skipBreakdown.companyLimit} reached the company limit`,
                      skipBreakdown.applicationLimit > 0 &&
                        `${skipBreakdown.applicationLimit} reached the application limit`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {latest.skipped > 0 && recordedSkipCount === 0 ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    This run predates skip details. Run the search again to
                    apply the current company matching rules.
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Finished {formatTime(latest.completedAt)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No searches yet.
              </p>
            )}
            {failedSources.length ? (
              <div className="mt-4 space-y-2 border-t pt-3">
                {failedSources.map((source) => (
                  <p
                    key={source.key}
                    className="flex gap-2 text-xs leading-5 text-warning"
                  >
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <b>{source.label}:</b> {source.error}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
            {latest ? (
              <ul className="mt-4 divide-y border-t text-xs">
                {latest.sources.map((source) => (
                  <li
                    key={source.key}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {source.error ? (
                        <AlertCircle className="size-3.5 shrink-0 text-warning" />
                      ) : (
                        <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                      )}
                      <span className="truncate">{source.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {source.error
                        ? "failed"
                        : `${source.matched} / ${source.fetched}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </aside>
      </section>

      <section className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Feeds:</span> Remotive ·
        Jobicy · Arbeitnow · Remote OK · We Work Remotely
      </section>
    </main>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(event) =>
          onChange(Math.min(100, Math.max(1, Number(event.target.value) || 1)))
        }
      />
    </label>
  );
}

const defaults: JobSearchSettingsInput = {
  query: "",
  location: "",
  employmentType: "any",
  remoteOnly: false,
  intervalMinutes: 0,
  maxApplications: 10,
  maxCompanies: 5,
  enabled: false,
};
function toInput(settings: JobSearchSettings): JobSearchSettingsInput {
  return {
    query: settings.query,
    location: settings.location,
    employmentType: settings.employmentType,
    remoteOnly: settings.remoteOnly,
    intervalMinutes: settings.intervalMinutes,
    maxApplications: settings.maxApplications,
    maxCompanies: settings.maxCompanies,
    enabled: settings.enabled,
  };
}
function formatTime(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
