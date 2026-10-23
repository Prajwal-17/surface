import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { analysisSettingsInputSchema } from "@surface/contracts";
import { getSettings, saveSettings } from "./settings";
export const analysisRoutes = new Hono();
analysisRoutes.get("/settings", async (c) => c.json(await getSettings()));
analysisRoutes.put(
  "/settings",
  zValidator("json", analysisSettingsInputSchema),
  async (c) => c.json(await saveSettings(c.req.valid("json"))),
);
