import { jobPreferencesInputSchema } from "../../shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getJobPreferences, updateJobPreferences } from "./profile.service";

export const profileRoutes = new Hono();

profileRoutes.get("/", (context) => {
  return context.json({ preferences: getJobPreferences() });
});

profileRoutes.put(
  "/",
  zValidator("json", jobPreferencesInputSchema),
  (context) => {
    const preferences = updateJobPreferences(context.req.valid("json"));
    return context.json({ preferences });
  },
);
