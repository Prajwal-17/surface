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
import { resolveCompany } from "../workspace/company-identity";
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

async function applicationCompany(
  tx: Transaction,
  name: string,
  now: string,
  companyId?: string | null,
) {
  const company = await resolveCompany(tx, name, now, companyId);
  if (!company)
    throw new HttpError(
      409,
      "Choose a specific company from Companies before adding this application.",
    );
  return { companyId: company.id, companyName: company.name };
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
    const now = new Date().toISOString();
    const row = await transaction(async (tx) => {
      const link = await applicationCompany(
        tx,
        input.companyName,
        now,
        input.companyId,
      );
      const [created] = await tx
        .insert(applications)
        .values({
          ...patchFields(input, now),
          ...link,
          title: input.title,
          id: crypto.randomUUID(),
          createdAt: now,
        })
        .returning();
      return created;
    });
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
      const now = new Date().toISOString();
      const link =
        input.companyId !== undefined || input.companyName !== undefined
          ? await applicationCompany(
              tx,
              input.companyName ?? current.companyName,
              now,
              input.companyId ??
                (input.companyName === undefined ? current.companyId : null),
            )
          : {};
      const [updated] = await tx
        .update(applications)
        .set({ ...patchFields(input, now, current), ...link })
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
      if (
        current?.companyId &&
        current.status === input.status &&
        !current.archivedAt
      )
        return current;

      const now = new Date().toISOString();
      const link = await applicationCompany(
        tx,
        current?.companyName ?? job.company,
        now,
        current?.companyId ?? job.companyId,
      );
      const fields = patchFields(
        {
          status: input.status,
          appliedOn: current?.appliedOn ?? input.appliedOn,
          archived: current?.archivedAt ? false : undefined,
        },
        now,
        current,
      );
      const [updated] = current
        ? await tx
            .update(applications)
            .set({ ...fields, ...link })
            .where(eq(applications.id, current.id))
            .returning()
        : await tx
            .insert(applications)
            .values({
              ...fields,
              id: crypto.randomUUID(),
              jobId: job.id,
              ...link,
              title: job.title,
              sourceUrl: job.applyUrl || job.canonicalUrl,
              location: job.location,
              employmentType: job.employmentType,
              workMode: job.workMode,
              compensation: job.compensation,
              createdAt: now,
            })
            .returning();

      if (!job.companyId)
        await tx
          .update(jobs)
          .set({ companyId: link.companyId })
          .where(eq(jobs.id, job.id));
      if (updated) await reflectJobStatus(tx, updated, now);
      return updated;
    });
    return c.json(row);
  },
);
