import { Hono } from "hono";
import { z } from "zod";
import { env } from "../../config/env";
import {
  getRuntimeSettings,
  updateRuntimeSettings,
} from "../../config/runtime";
import { hasDesktopToken } from "../auth/session";

export const desktopRoutes = new Hono();

const configSchema = z
  .object({
    searxngUrl: z.string().url().max(2048).optional(),
    omnirouteUrl: z.string().url().max(2048).optional(),
    omnirouteApiKey: z.string().max(4096).optional(),
    omnirouteModel: z.string().trim().min(1).max(200).optional(),
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

desktopRoutes.get("/status", async (context) =>
  context.json(statusPayload()),
);

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
      omnirouteBaseUrl: parsed.data.omnirouteUrl,
      omnirouteApiKey: parsed.data.omnirouteApiKey,
      omnirouteModel: parsed.data.omnirouteModel,
    });
  } catch (error) {
    return context.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid service URL.",
      },
      400,
    );
  }
  return context.json(statusPayload());
});

desktopRoutes.get("/diagnostics", async (context) => {
  const settings = getRuntimeSettings();
  const [crawler, searxng, omniroute] = await Promise.all([
    probe(`${env.CRAWLER_BASE_URL.replace(/\/$/, "")}/health`),
    probeSearxng(settings.searxngBaseUrl),
    probeOmniRoute(settings.omnirouteBaseUrl),
  ]);
  return context.json({
    crawler,
    searxng,
    omniroute,
    searxngConfigured: Boolean(settings.searxngBaseUrl),
    omnirouteConfigured: Boolean(settings.omnirouteApiKey),
  });
});

function statusPayload() {
  const settings = getRuntimeSettings();
  return {
    desktop: Boolean(env.SURFACE_DESKTOP_TOKEN),
    embeddedDatabase: env.EMBEDDED_DATABASE,
    dataDir: env.DATA_DIR,
    searxngUrl: settings.searxngBaseUrl,
    omnirouteUrl: settings.omnirouteBaseUrl,
    omnirouteModel: settings.omnirouteModel,
    omnirouteConfigured: Boolean(settings.omnirouteApiKey),
    secretStorage: process.env.SURFACE_SECRET_STORAGE ?? "environment",
  };
}

async function probe(url: string) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
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
    const url = new URL(
      "search",
      `${baseUrl.replace(/\/?$/, "")}/`,
    );
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

async function probeOmniRoute(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      signal: AbortSignal.timeout(3000),
      headers: {
        Authorization: `Bearer ${getRuntimeSettings().omnirouteApiKey}`,
      },
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
