import { Hono } from "hono";
import { z } from "zod";
import { env } from "../../config/env";
import {
  aiConfigured,
  getRuntimeSettings,
  updateRuntimeSettings,
} from "../../config/runtime";
import { hasDesktopToken } from "../auth/session";

export const desktopRoutes = new Hono();

const configSchema = z
  .object({
    searxngUrl: z.string().url().max(2048).optional(),
    aiProvider: z.string().trim().min(1).max(64).optional(),
    aiBaseUrl: z.string().url().max(2048).optional(),
    aiApiKey: z.string().max(4096).optional(),
    aiModel: z.string().trim().min(1).max(200).optional(),
    aiReasoning: z.enum(["default", "low", "medium", "high"]).optional(),
  })
  .strict();

desktopRoutes.use("/config", async (context, next) => {
  if (!hasDesktopToken(context)) {
    return context.json(
      { error: "Desktop configuration requires the app-owned session token." },
      403,
    );
  }
  return next();
});

desktopRoutes.get("/status", async (context) => context.json(statusPayload()));

desktopRoutes.put("/config", async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return context.json({ error: "Enter valid desktop settings." }, 400);
  }
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return context.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid desktop settings." },
      400,
    );
  }
  try {
    updateRuntimeSettings({
      searxngBaseUrl: parsed.data.searxngUrl,
      provider: parsed.data.aiProvider,
      baseUrl: parsed.data.aiBaseUrl,
      apiKey: parsed.data.aiApiKey,
      model: parsed.data.aiModel,
      reasoning: parsed.data.aiReasoning,
    });
  } catch (error) {
    return context.json(
      {
        error: error instanceof Error ? error.message : "Invalid AI settings.",
      },
      400,
    );
  }
  return context.json(statusPayload());
});

desktopRoutes.get("/diagnostics", async (context) => {
  const settings = getRuntimeSettings();
  const [crawler, searxng, ai] = await Promise.all([
    process.env.SURFACE_CRAWLER_DISABLED === "1"
      ? {
          ok: false,
          status: null,
          error: "Browser research is disabled for this launch.",
        }
      : probe(`${env.CRAWLER_BASE_URL.replace(/\/$/, "")}/health`),
    probeSearxng(settings.searxngBaseUrl),
    probeAi(settings.baseUrl, settings.apiKey),
  ]);
  return context.json({
    crawler,
    searxng,
    ai,
    searxngConfigured: Boolean(settings.searxngBaseUrl),
    aiConfigured: aiConfigured(settings),
    aiKeyPresent: Boolean(settings.apiKey),
  });
});

function statusPayload() {
  const settings = getRuntimeSettings();
  return {
    desktop: Boolean(env.SURFACE_DESKTOP_TOKEN),
    database: env.DATABASE_DIALECT,
    databaseFile: env.SQLITE_DATABASE_FILE ?? null,
    dataDir: env.DATA_DIR,
    searxngUrl: settings.searxngBaseUrl,
    aiProvider: settings.provider,
    aiBaseUrl: settings.baseUrl,
    aiModel: settings.model,
    aiReasoning: settings.reasoning,
    aiConfigured: aiConfigured(settings),
    aiKeyPresent: Boolean(settings.apiKey),
    secretStorage: process.env.SURFACE_SECRET_STORAGE ?? "environment",
  };
}

async function probe(url: string, headers?: Record<string, string>) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers,
    });
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "Unavailable.",
    };
  }
}

async function probeSearxng(baseUrl: string) {
  try {
    const url = new URL("search", `${baseUrl.replace(/\/?$/, "")}/`);
    url.searchParams.set("q", "surface connectivity check");
    url.searchParams.set("format", "json");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `SearXNG returned HTTP ${response.status}.`,
      };
    }
    const body = (await response.json()) as { results?: unknown[] };
    return {
      ok: true,
      status: response.status,
      error: null,
      results: Array.isArray(body.results) ? body.results.length : 0,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error:
        error instanceof Error
          ? `Cannot reach SearXNG: ${error.message}`
          : "Cannot reach SearXNG.",
    };
  }
}

/**
 * Reachability and authenticated model access only. This never starts a paid
 * generation; the settings screen tells the difference explicitly.
 */
async function probeAi(baseUrl: string, apiKey: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const reachable = await probe(url);
  return {
    reachable,
    modelAccess: apiKey
      ? await probe(url, { Authorization: `Bearer ${apiKey}` })
      : null,
  };
}
