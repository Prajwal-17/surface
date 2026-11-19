import { Hono, type Context } from "hono";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error";
import { cancelActiveRun, startRunWorker } from "./lead-agent";
import {
  createRun,
  findCompanyById,
  finishRun,
  getCompanyOverview,
  getLeadSettings,
  getRun,
  getRunDetails,
  listCompanyEvidence,
  listCompanyResearchRuns,
  listRunEvents,
  listRuns,
  recordRunEvent,
  requireRun,
  updateLeadSettings,
} from "./leads.repository";
import { checkSearxngConnection } from "./search";
import {
  getSearxngDockerStatus,
  startSearxngDocker,
  stopSearxngDocker,
} from "./searxng-docker";

export const leadRoutes = new Hono();

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().default("");

const discoveryCriteriaSchema = z
  .object({
    industry: optionalText(300),
    geography: optionalText(300),
    companyType: optionalText(300),
    signals: optionalText(2000),
    exclusions: optionalText(2000),
    limit: z.number().int().min(1).max(15).default(5),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.industry || value.geography || value.companyType || value.signals,
      ),
    "Add at least one search criterion.",
  );

const researchInputSchema = z
  .object({
    companyId: z.string().trim().min(1).max(64),
    question: optionalText(1000),
  })
  .strict();

const settingsInputSchema = z
  .object({
    searxngUrl: z.string().trim().max(2048).optional().default(""),
    productContext: optionalText(4000),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(
      400,
      result.error.issues[0]?.message ?? "Invalid lead discovery data.",
    );
  }
  return result.data;
}

async function readBody(context: Context) {
  try {
    return await context.req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function validateSearxngUrl(value: string) {
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Use a valid SearXNG instance URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HttpError(400, "The SearXNG URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new HttpError(
      400,
      "Do not put credentials in the SearXNG URL. Use a local or self-hosted instance instead.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

leadRoutes.get("/settings", async (context) =>
  context.json(await getLeadSettings()),
);

leadRoutes.put("/settings", async (context) => {
  const input = parse(settingsInputSchema, await readBody(context));
  return context.json(
    await updateLeadSettings({
      searxngUrl: validateSearxngUrl(input.searxngUrl),
      productContext: input.productContext,
    }),
  );
});

leadRoutes.post("/settings/check", async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = z
    .object({ searxngUrl: z.string().trim().max(2048).optional() })
    .strict()
    .safeParse(body);
  if (body !== null && !parsed.success) {
    throw new HttpError(400, "Enter a valid SearXNG instance URL.");
  }
  const requestedUrl = parsed.success ? parsed.data.searxngUrl : undefined;
  const current = await getLeadSettings();
  const instanceUrl = requestedUrl?.trim()
    ? validateSearxngUrl(requestedUrl)
    : current.searxngUrl;
  if (!instanceUrl.trim()) {
    throw new HttpError(400, "Add a SearXNG instance URL first.");
  }
  return context.json(await checkSearxngConnection(instanceUrl));
});

leadRoutes.get("/searxng/status", async (context) =>
  context.json(await getSearxngDockerStatus()),
);

leadRoutes.post("/searxng/start", async (context) =>
  context.json(await startSearxngDocker()),
);

leadRoutes.post("/searxng/stop", async (context) =>
  context.json(await stopSearxngDocker()),
);

leadRoutes.get("/runs", async (context) => context.json(await listRuns()));

leadRoutes.post("/runs", async (context) => {
  const criteria = parse(discoveryCriteriaSchema, await readBody(context));
  const settings = await getLeadSettings();
  if (!settings.searxngUrl.trim()) {
    throw new HttpError(
      400,
      "Add a SearXNG instance URL in Find leads settings before starting a run.",
    );
  }
  const run = await createRun("discovery", criteria);
  void startRunWorker(run.id);
  return context.json(run, 202);
});

leadRoutes.get("/runs/:id", async (context) =>
  context.json(await getRunDetails(context.req.param("id"))),
);

leadRoutes.get("/runs/:id/events", async (context) =>
  context.json(await listRunEvents(context.req.param("id"))),
);

leadRoutes.post("/runs/:id/cancel", async (context) => {
  const run = await requireRun(context.req.param("id"));
  if (!["queued", "running"].includes(run.state)) {
    throw new HttpError(409, "This run is no longer active.");
  }
  await recordRunEvent(run.id, "cancel", "Cancellation requested.");
  await finishRun(run.id, {
    state: "cancelled",
    summary: "Run cancelled.",
  });
  cancelActiveRun(run.id);
  return context.json({ cancelled: true });
});

leadRoutes.post("/research", async (context) => {
  const input = parse(researchInputSchema, await readBody(context));
  const company = await findCompanyById(input.companyId);
  if (!company) throw new HttpError(404, "Company not found.");
  const settings = await getLeadSettings();
  if (!settings.searxngUrl.trim()) {
    throw new HttpError(
      400,
      "Add a SearXNG instance URL in Find leads settings before researching a company.",
    );
  }
  const run = await createRun("research", {
    companyId: input.companyId,
    question:
      input.question ||
      "What should we know before reaching out, and what is a credible reason to contact them?",
  });
  void startRunWorker(run.id);
  return context.json(run, 202);
});

leadRoutes.get("/companies/:id/overview", async (context) =>
  context.json(await getCompanyOverview(context.req.param("id"))),
);

leadRoutes.get("/companies/:id/evidence", async (context) =>
  context.json(await listCompanyEvidence(context.req.param("id"))),
);

leadRoutes.get("/companies/:id/research-runs", async (context) =>
  context.json(await listCompanyResearchRuns(context.req.param("id"))),
);

leadRoutes.get("/runs/:id/status", async (context) => {
  const run = await getRun(context.req.param("id"));
  if (!run) throw new HttpError(404, "Discovery run not found.");
  return context.json({
    id: run.id,
    state: run.state,
    resultCount: run.resultCount,
    skippedCount: run.skippedCount,
    error: run.error,
    updatedAt: run.updatedAt,
  });
});
