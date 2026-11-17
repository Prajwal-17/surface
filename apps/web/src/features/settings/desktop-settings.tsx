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
  ai: {
    reachable: { ok: boolean; status: number | null; error: string | null };
    modelAccess: {
      ok: boolean;
      status: number | null;
      error: string | null;
    } | null;
  };
  searxngConfigured: boolean;
  aiConfigured: boolean;
  aiKeyPresent: boolean;
}

type DesktopSettingsSnapshot = Awaited<
  ReturnType<NonNullable<Window["surfaceDesktop"]>["getSettings"]>
>;

export function DesktopSettings() {
  const desktop = window.surfaceDesktop;
  const [settings, setSettings] = useState<DesktopSettingsSnapshot | null>(
    null,
  );
  const [searxngUrl, setSearxngUrl] = useState("");
  const [aiProvider, setAiProvider] = useState("opencode-go");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiReasoning, setAiReasoning] =
    useState<DesktopSettingsSnapshot["aiReasoning"]>("default");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<Awaited<
    ReturnType<NonNullable<Window["surfaceDesktop"]>["appInfo"]>
  > | null>(null);
  const appName =
    appInfo?.channel === "development" ? "Surface Dev" : "Surface";

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
        setAiProvider(value.aiProvider);
        setAiBaseUrl(value.aiBaseUrl);
        setAiModel(value.aiModel);
        setAiReasoning(value.aiReasoning);
        if (value.secretStorage === "plaintext") {
          toast.warning(
            "OS encryption is unavailable. The AI key is stored with file permissions only.",
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
          SearXNG and AI URLs come from the backend environment in this browser
          build. In the Surface desktop app they are saved under your user data
          directory, with the OpenCode Go key protected by the OS keychain when
          available.
        </p>
        <ServiceDiagnostics
          diagnostics={diagnostics.data}
          error={diagnostics.error}
          loading={diagnostics.isLoading}
        />
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
        aiProvider,
        aiBaseUrl,
        aiModel,
        aiReasoning,
        ...(apiKey.trim() ? { aiApiKey: apiKey.trim() } : {}),
        clearAiApiKey: clearKey,
      });
      setSettings(result.settings);
      setApiKey("");
      setClearKey(false);
      if (result.applied.ok) {
        toast.success("Service settings saved and applied.");
      } else {
        toast.warning(
          `Settings saved, but the running backend did not apply them: ${result.applied.error ?? "unknown error"}. Restart ${appName} to apply them.`,
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
          reports a clear error. AI generation uses your OpenCode Go
          subscription directly; no local model gateway is required.
        </p>
        {settings?.legacyOmniRouteConfigured ? (
          <p className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground">
            An older OmniRoute key is retained only as legacy data. It is never
            sent to OpenCode. Enter a separate OpenCode Go key below.
          </p>
        ) : null}
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
              <span className="font-medium">AI provider</span>
              <Input required value={aiProvider} readOnly />
              <span className="block text-xs text-muted-foreground">
                Supported: opencode-go
              </span>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">AI model</span>
              <Input
                required
                list="opencode-go-models"
                value={aiModel}
                onChange={(event) => setAiModel(event.target.value)}
              />
              <datalist
                id="opencode-go-models"
                aria-label="Suggested OpenCode Go models"
              >
                <option value="deepseek-v4.1-flash">deepseek-v4.1-flash</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                <option value="kimi-k3">kimi-k3</option>
                <option value="step-5-preview">step-5-preview</option>
              </datalist>
              <span className="block text-xs text-muted-foreground">
                Choose a suggested model or enter another OpenCode Go model ID.
              </span>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Reasoning effort</span>
              <select
                className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={aiReasoning}
                onChange={(event) =>
                  setAiReasoning(
                    event.target
                      .value as DesktopSettingsSnapshot["aiReasoning"],
                  )
                }
              >
                <option value="default">Model default</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <span className="block text-xs text-muted-foreground">
                Effort support depends on the selected model. Use model default
                if unsupported.
              </span>
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">AI base URL</span>
              <Input
                type="url"
                required
                value={aiBaseUrl}
                onChange={(event) => setAiBaseUrl(event.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                Example: https://opencode.ai/inference/go/openai/v1
              </span>
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">OpenCode Go API key</span>
              <Input
                type="password"
                autoComplete="off"
                placeholder={
                  settings.hasAiApiKey
                    ? "A key is saved. Leave blank to keep it."
                    : "Enter your OpenCode Go API key"
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
            {settings.hasAiApiKey ? (
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
            <Database className="size-4" /> {appName} {appInfo.version} ·{" "}
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
      label: "OpenCode Go",
      detail: !diagnostics.aiKeyPresent
        ? "API key not configured"
        : diagnostics.ai.modelAccess?.ok
          ? "API key authenticated and model access confirmed"
          : `API key present; model access failed${
              diagnostics.ai.modelAccess?.error
                ? ` (${diagnostics.ai.modelAccess.error})`
                : ""
            }`,
      state: diagnostics.ai.modelAccess ?? diagnostics.ai.reachable,
    },
    {
      label: "AI provider endpoint",
      detail: diagnostics.ai.reachable.ok
        ? "Models endpoint reachable"
        : "Provider endpoint unreachable",
      state: diagnostics.ai.reachable,
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
      return "AI key encrypted with the OS keychain.";
    case "basic-text":
      return "OS keyring is using its basic-text backend; the key is obscured but not strongly protected.";
    case "plaintext":
      return "OS encryption is unavailable; the key is protected by file permissions only.";
    case "unavailable":
      return "OS secure storage is unavailable.";
  }
}
