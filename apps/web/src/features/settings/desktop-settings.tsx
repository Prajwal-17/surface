import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Database,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Diagnostics {
  crawler: { ok: boolean; status: number | null; error: string | null };
  searxng: {
    ok: boolean;
    status: number | null;
    error: string | null;
    results?: number;
  };
  omniroute: { ok: boolean; status: number | null; error: string | null };
  searxngConfigured: boolean;
  omnirouteConfigured: boolean;
}

type DesktopSettingsSnapshot = Awaited<
  ReturnType<NonNullable<Window["surfaceDesktop"]>["getSettings"]>
>;

export function DesktopSettings() {
  const desktop = window.surfaceDesktop;
  const [settings, setSettings] = useState<DesktopSettingsSnapshot | null>(null);
  const [searxngUrl, setSearxngUrl] = useState("");
  const [omnirouteUrl, setOmnirouteUrl] = useState("");
  const [omnirouteModel, setOmnirouteModel] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<Awaited<
    ReturnType<NonNullable<Window["surfaceDesktop"]>["appInfo"]>
  > | null>(null);

  const diagnostics = useQuery({
    queryKey: ["desktop-diagnostics"],
    queryFn: () => apiClient<Diagnostics>("/api/desktop/diagnostics"),
    enabled: Boolean(desktop),
    retry: false,
  });

  useEffect(() => {
    if (!desktop) return;
    void desktop
      .getSettings()
      .then((value) => {
        setSettings(value);
        setSearxngUrl(value.searxngUrl);
        setOmnirouteUrl(value.omnirouteUrl);
        setOmnirouteModel(value.omnirouteModel);
        if (value.secretStorage === "plaintext") {
          toast.warning(
            "OS encryption is unavailable. The OmniRoute key is stored with file permissions only.",
          );
        }
      })
      .catch((error: unknown) =>
        setLoadError(
          error instanceof Error ? error.message : "Cannot load settings.",
        ),
      );
    void desktop.appInfo().then(setAppInfo);
  }, [desktop]);

  if (!desktop) {
    return (
      <section className="max-w-3xl space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="size-5 text-brand" /> Desktop services
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          SearXNG and OmniRoute URLs come from the backend environment in this
          browser build. In the Surface desktop app they are saved under your
          user data directory, with the OmniRoute key protected by the OS
          keychain when available.
        </p>
        <ServiceDiagnostics diagnostics={diagnostics.data} error={diagnostics.error} loading={diagnostics.isLoading} />
      </section>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!desktop) return;
    setSaving(true);
    try {
      const result = await desktop.saveSettings({
        searxngUrl,
        omnirouteUrl,
        omnirouteModel,
        ...(apiKey.trim() ? { omnirouteApiKey: apiKey.trim() } : {}),
        clearOmniRouteKey: clearKey,
      });
      setSettings(result.settings);
      setApiKey("");
      setClearKey(false);
      if (result.applied.ok) {
        toast.success("Service settings saved and applied.");
      } else {
        toast.warning(
          `Settings saved, but the running backend did not apply them: ${result.applied.error ?? "unknown error"}. Restart Surface to apply them.`,
        );
      }
      void diagnostics.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="size-5 text-brand" /> Research and AI services
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          SearXNG is optional: without it, jobs, monitoring, snapshots and
          company research from saved sources still work, while web search
          reports a clear error. OmniRoute stays external to the desktop app.
        </p>
      </div>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : !settings ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading settings…
        </p>
      ) : (
        <form onSubmit={save} className="rounded-lg border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">SearXNG URL</span>
              <Input
                type="url"
                required
                value={searxngUrl}
                onChange={(event) => setSearxngUrl(event.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                Example: http://127.0.0.1:8080
              </span>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">OmniRoute model</span>
              <Input
                required
                value={omnirouteModel}
                onChange={(event) => setOmnirouteModel(event.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                The model name exposed by your OmniRoute endpoint.
              </span>
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">OmniRoute base URL</span>
              <Input
                type="url"
                required
                value={omnirouteUrl}
                onChange={(event) => setOmnirouteUrl(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">OmniRoute API key</span>
              <Input
                type="password"
                autoComplete="off"
                placeholder={
                  settings.hasOmniRouteKey
                    ? "A key is saved. Leave blank to keep it."
                    : "Enter the key for your OmniRoute endpoint"
                }
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {settings.secretStorage === "os-encrypted" ? (
                <ShieldCheck className="size-3.5 text-success" />
              ) : settings.secretStorage === "plaintext" ||
                settings.secretStorage === "unavailable" ? (
                <TriangleAlert className="size-3.5 text-warning" />
              ) : (
                <ShieldCheck className="size-3.5 text-warning" />
              )}
              {secretStorageLabel(settings.secretStorage)}
            </span>
            {settings.hasOmniRouteKey ? (
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(event) => setClearKey(event.target.checked)}
                />
                Remove saved key
              </label>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Save service settings
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void diagnostics.refetch()}
              disabled={diagnostics.isFetching}
            >
              <RefreshCw
                className={diagnostics.isFetching ? "animate-spin" : ""}
              />
              Check services
            </Button>
            {appInfo ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void desktop.openDataDir()}
              >
                <FolderOpen /> Open data folder
              </Button>
            ) : null}
          </div>
        </form>
      )}

      {appInfo ? (
        <div className="rounded-lg border bg-card p-3 text-xs leading-5 text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Database className="size-4" /> Surface {appInfo.version} ·{" "}
            {appInfo.database} ·{" "}
            {appInfo.packaged ? "packaged app" : "development app"}
          </p>
          <p className="mt-1 break-all">Data: {appInfo.dataDir}</p>
          <p className="break-all">Logs: {appInfo.logsDir}</p>
        </div>
      ) : null}

      <ServiceDiagnostics
        diagnostics={diagnostics.data}
        error={diagnostics.error}
        loading={diagnostics.isLoading}
      />
    </section>
  );
}

function ServiceDiagnostics({
  diagnostics,
  error,
  loading,
}: {
  diagnostics: Diagnostics | undefined;
  error: Error | null;
  loading: boolean;
}) {
  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Checking services…
      </p>
    );
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    );
  if (!diagnostics) return null;
  const rows = [
    {
      label: "Local crawler",
      detail: "Playwright Chromium · required for page reading",
      state: diagnostics.crawler,
    },
    {
      label: "SearXNG search",
      detail: diagnostics.searxng.ok
        ? `JSON search is responding${
            diagnostics.searxng.results !== undefined
              ? ` (${diagnostics.searxng.results} results)`
              : ""
          }`
        : "Optional · research without web search still uses saved sources",
      state: diagnostics.searxng,
    },
    {
      label: "OmniRoute",
      detail: diagnostics.omnirouteConfigured
        ? "API key configured"
        : "API key not configured",
      state: diagnostics.omniroute,
    },
  ];
  return (
    <div className="divide-y rounded-lg border bg-card">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-start justify-between gap-4 p-3"
        >
          <div>
            <p className="text-sm font-medium">{row.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.detail}
              {row.state.error ? ` · ${row.state.error}` : ""}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              row.state.ok ? "text-success" : "text-warning"
            }`}
          >
            {row.state.ok ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <XCircle className="size-4" />
            )}
            {row.state.ok ? "Connected" : "Unavailable"}
          </span>
        </div>
      ))}
    </div>
  );
}

function secretStorageLabel(value: DesktopSettingsSnapshot["secretStorage"]) {
  switch (value) {
    case "os-encrypted":
      return "OmniRoute key encrypted with the OS keychain.";
    case "basic-text":
      return "OS keyring is using its basic-text backend; the key is obscured but not strongly protected.";
    case "plaintext":
      return "OS encryption is unavailable; the key is protected by file permissions only.";
    case "unavailable":
      return "OS secure storage is unavailable.";
  }
}
