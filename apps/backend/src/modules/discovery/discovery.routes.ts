import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { discoverySearchSchema } from "@surface/contracts";
import { db } from "../../infrastructure/database/client";
import { configuredSources } from "../workspace/workspace.tables";
import { enqueueCollection } from "../work/work.service";
export const discoveryRoutes = new Hono();
discoveryRoutes.post(
  "/search",
  zValidator("json", discoverySearchSchema),
  async (c) => {
    const sources = (await db.select().from(configuredSources)).filter(
      (s) => !s.paused && s.support !== "unsupported",
    );
    return c.json(
      await enqueueCollection(
        sources.map((s) => s.id),
        `Search · ${c.req.valid("json").query}`,
      ),
      202,
    );
  },
);
