import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { discoverySearchSchema } from "../../shared/contracts";
import { db } from "../../infrastructure/database/client";
import { configuredSources } from "../workspace/workspace.tables";
import { enqueueCollection } from "../work/work.service";
export const discoveryRoutes = new Hono();
discoveryRoutes.post(
  "/search",
  zValidator("json", discoverySearchSchema),
  (c) => {
    const sources = db
      .select()
      .from(configuredSources)
      .all()
      .filter((s) => !s.paused && s.support !== "unsupported");
    return c.json(
      enqueueCollection(
        sources.map((s) => s.id),
        `Search · ${c.req.valid("json").query}`,
      ),
      202,
    );
  },
);
