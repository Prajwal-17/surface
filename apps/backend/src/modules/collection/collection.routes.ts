import { cleanupSnapshots } from "./cleanup";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { join } from "node:path";
import { db } from "../../infrastructure/database/client";
import { enqueueCollection } from "../work/work.service";
import { decideDuplicate } from "../jobs/duplicates";
import { snapshots } from "./collection.tables";
import { snapshotDirectory } from "./snapshots";
import { HttpError } from "../../shared/errors/http-error";
export const collectionRoutes = new Hono();
collectionRoutes.post("/sources/:id/refresh", (c) =>
  c.json(enqueueCollection([c.req.param("id")]), 202),
);
collectionRoutes.post(
  "/duplicates/:id",
  zValidator(
    "json",
    z.object({ action: z.enum(["merge", "separate", "undo"]) }),
  ),
  (c) => c.json(decideDuplicate(c.req.param("id"), c.req.valid("json").action)),
);
collectionRoutes.get("/snapshots/:id/download", async (c) => {
  const row = db
    .select()
    .from(snapshots)
    .where(eq(snapshots.id, c.req.param("id")))
    .get();
  if (!row || row.removedAt)
    throw new HttpError(
      410,
      "Raw evidence has been removed or is unavailable.",
    );
  const file = Bun.file(join(snapshotDirectory, row.hash));
  if (!(await file.exists()))
    throw new HttpError(410, "Raw evidence file is unavailable.");
  return new Response(file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.hash}.txt"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
});

collectionRoutes.get("/snapshots/cleanup", (c) => c.json(cleanupSnapshots()));
collectionRoutes.post(
  "/snapshots/cleanup",
  zValidator("json", z.object({ confirm: z.literal(true) })),
  (c) => c.json(cleanupSnapshots(true)),
);
