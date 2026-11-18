import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { jobSearchSettingsInputSchema } from "@surface/contracts";
import {
  getJobSearchSettings,
  runJobSearch,
  saveJobSearchSettings,
} from "./job-search.service";

export const jobSearchRoutes = new Hono();
jobSearchRoutes.get("/settings", async (c) =>
  c.json(await getJobSearchSettings()),
);
jobSearchRoutes.put(
  "/settings",
  zValidator("json", jobSearchSettingsInputSchema),
  async (c) => c.json(await saveJobSearchSettings(c.req.valid("json"))),
);
jobSearchRoutes.post("/run", async (c) => c.json(await runJobSearch()));
