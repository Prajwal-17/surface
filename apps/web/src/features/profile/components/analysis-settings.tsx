"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisSettingsSchema } from "backend/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ScanLine, Pause, Play, RefreshCw, Zap } from "lucide-react";
export function AnalysisSettings() {
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["analysis-settings"],
    queryFn: async () =>
      analysisSettingsSchema.parse(await apiClient("/api/analysis/settings")),
    refetchInterval: (q) => (q.state.data?.queued ? 5000 : false),
  });
  const [limit, setLimit] = useState<string | null>(null),
    [timezone, setTimezone] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({
      path,
      body,
      method,
    }: {
      path: string;
      body: unknown;
      method: string;
    }) => apiClient(path, { method, body: JSON.stringify(body) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["analysis-settings"] });
      await client.invalidateQueries({ queryKey: ["runs"] });
      toast.success("Analysis settings updated");
    },
    onError: (e) => toast.error(e.message),
  });
  if (settings.error) return <p role="alert">{settings.error.message}</p>;
  if (!settings.data) return <p role="status">Loading analysis settings…</p>;
  const data = settings.data;
  const update = (paused: boolean) =>
    save.mutate({
      path: "/api/analysis/settings",
      method: "PUT",
      body: {
        dailyLimit: Number(limit ?? data.dailyLimit),
        timezone: timezone ?? data.timezone,
        paused,
      },
    });
  return (
    <section className="mx-auto mt-8 mb-4 max-w-5xl space-y-4 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ScanLine className="size-5 text-brand" />
          Automatic analysis
        </h2>
        <span
          className={`status-pill ${!data.configured || !data.enabled || data.paused ? "tone-amber" : "tone-mint"}`}
        >
          {!data.configured
            ? "Not configured"
            : !data.enabled
              ? "Awaiting profile"
              : data.paused
                ? "Paused"
                : "Enabled"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {!data.configured
          ? "OmniRoute is not configured. Collection and filtering remain available."
          : !data.enabled
            ? "Save a usable profile to enable automatic analysis of new relevant jobs."
            : data.paused
              ? "Analysis is paused. Existing results remain available."
              : "Automatic analysis enabled · Up to two concurrent requests"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs text-muted-foreground">Daily allowance</p>
          <p className="text-2xl font-bold tracking-tight">
            {data.used}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / {data.dailyLimit} requests used
            </span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${data.dailyLimit ? Math.min(100, (data.used / data.dailyLimit) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs text-muted-foreground">
            Waiting for assessment
          </p>
          <p className="text-2xl font-bold tracking-tight">
            {data.queued}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              jobs in queue
            </span>
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-brand">
            <Zap className="size-3" />
            Up to two requests at a time
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Next reset:{" "}
        {new Date(data.nextResetAt).toLocaleString(undefined, {
          timeZone: data.timezone,
        })}{" "}
        ({data.timezone}). Failed requests and retries count toward the
        allowance.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          Daily request limit
          <Input
            type="number"
            min={0}
            max={1000}
            value={limit ?? data.dailyLimit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          Local timezone
          <Input
            value={timezone ?? data.timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={save.isPending} onClick={() => update(data.paused)}>
          Save analysis settings
        </Button>
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => update(!data.paused)}
        >
          {data.paused ? <Play /> : <Pause />}
          {data.paused ? "Resume analysis" : "Pause analysis"}
        </Button>
        <Button
          variant="secondary"
          disabled={save.isPending || !data.enabled}
          onClick={() =>
            save.mutate({
              path: "/api/analysis/existing-inbox",
              method: "POST",
              body: {},
            })
          }
        >
          <RefreshCw />
          Analyze existing inbox
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Existing jobs are analyzed only when requested or materially changed.
        Excess work stays queued for the next allowance period. Timezone changes
        take effect after the current allowance resets.
      </p>
    </section>
  );
}
