import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { analysisSettingsInputSchema } from "../../shared/contracts";
import { getSettings, saveSettings } from "./allowance";
export const analysisRoutes = new Hono();
analysisRoutes.get("/settings", (c) => c.json(getSettings()));
analysisRoutes.put(
  "/settings",
  zValidator("json", analysisSettingsInputSchema),
  (c) => c.json(saveSettings(c.req.valid("json"))),
);
