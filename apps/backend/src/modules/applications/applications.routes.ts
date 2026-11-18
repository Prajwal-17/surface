import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  createApplicationSchema,
  jobApplicationInputSchema,
  updateApplicationSchema,
  type UpdateApplication,
} from "@surface/contracts";
import {
  db,
  transaction,
  type Database,
  type Transaction,
} from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import { jobs } from "../jobs/jobs.tables";
import { companies } from "../workspace/workspace.tables";
import { applications } from "./applications.tables";

export const applicationRoutes = new Hono();
type ApplicationRow = typeof applications.$inferSelect;

async function canonicalJob(connection: Database | Transaction, id: string) {
  const visited = new Set<string>();
  let current = id;
  while (!visited.has(current)) {
    visited.add(current);
    const [job] = await connection
      .select()
      .from(jobs)
      .where(eq(jobs.id, current));
    if (!job) throw new HttpError(404, "Job not found.");
    if (!job.mergedInto) return job;
    current = job.mergedInto;
  }
  throw new HttpError(409, "This job has an invalid merge history.");
}

async function existingCompany(connection: Database | Transaction, id: string) {
  const [company] = await connection
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, id));
  return company?.id ?? null;
}

function patchFields(
  input: UpdateApplication,
  now: string,
  current?: ApplicationRow,
) {
  const { archived, ...fields } = input;
  const today = now.slice(0, 10);
  return {
    ...fields,
    appliedOn:
      fields.appliedOn ??
      (fields.status === "applied"
        ? (current?.appliedOn ?? today)
        : fields.appliedOn),
    contactedOn:
      fields.contactedOn ??
      (fields.status === "contacted"
        ? (current?.contactedOn ?? today)
        : fields.contactedOn),
    archivedAt:
      archived === undefined
        ? undefined
        : archived
          ? (current?.archivedAt ?? now)
          : null,
    updatedAt: now,
  };
}

async function reflectJobStatus(
  tx: Transaction,
  row: ApplicationRow,
  now: string,
) {
  if (!row.jobId) return;
  const status = row.status === "ignored" ? "dismissed" : "saved";
  await tx
    .update(jobs)
    .set({ status, updatedAt: now })
    .where(and(eq(jobs.id, row.jobId), isNull(jobs.mergedInto)));
}

applicationRoutes.get("/applications", async (c) =>
  c.json(
    await db.select().from(applications).orderBy(desc(applications.updatedAt)),
  ),
);

applicationRoutes.post(
  "/applications",
  zValidator("json", createApplicationSchema),
  async (c) => {
    const input = c.req.valid("json");
    if (input.companyId && !(await existingCompany(db, input.companyId)))
      throw new HttpError(400, "Company not found.");
    const now = new Date().toISOString();
    const [row] = await db
      .insert(applications)
      .values({
        ...input,
        ...patchFields(input, now),
        id: crypto.randomUUID(),
        createdAt: now,
      })
      .returning();
    return c.json(row, 201);
  },
);

applicationRoutes.patch(
  "/applications/:id",
  zValidator("json", updateApplicationSchema),
  async (c) => {
    const input = c.req.valid("json");
    const id = c.req.param("id");
    const row = await transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id));
      if (!current) throw new HttpError(404, "Application not found.");
      if (input.companyId && !(await existingCompany(tx, input.companyId)))
        throw new HttpError(400, "Company not found.");
      const now = new Date().toISOString();
      const [updated] = await tx
        .update(applications)
        .set(patchFields(input, now, current))
        .where(eq(applications.id, id))
        .returning();
      if (input.status && updated) await reflectJobStatus(tx, updated, now);
      return updated;
    });
    return c.json(row);
  },
);

applicationRoutes.get("/jobs/:id/application", async (c) => {
  const job = await canonicalJob(db, c.req.param("id"));
  const [row] = await db
    .select()
    .from(applications)
    .where(eq(applications.jobId, job.id));
  return c.json(row ?? null);
});

applicationRoutes.put(
  "/jobs/:id/application",
  zValidator("json", jobApplicationInputSchema),
  async (c) => {
    const input = c.req.valid("json");
    const id = c.req.param("id");
    const row = await transaction(async (tx) => {
      const job = await canonicalJob(tx, id);
      const [current] = await tx
        .select()
        .from(applications)
        .where(eq(applications.jobId, job.id));
      if (current && current.status === input.status) return current;

      const now = new Date().toISOString();
      const fields = patchFields(
        {
          status: input.status,
          appliedOn: current?.appliedOn ?? input.appliedOn,
        },
        now,
        current,
      );
      const [updated] = current
        ? await tx
            .update(applications)
            .set(fields)
            .where(eq(applications.id, current.id))
            .returning()
        : await tx
            .insert(applications)
            .values({
              ...fields,
              id: crypto.randomUUID(),
              jobId: job.id,
              companyId: job.companyId
                ? await existingCompany(tx, job.companyId)
                : null,
              companyName: job.company,
              title: job.title,
              sourceUrl: job.applyUrl,
              createdAt: now,
            })
            .returning();

      if (updated) await reflectJobStatus(tx, updated, now);
      return updated;
    });
    return c.json(row);
  },
);
