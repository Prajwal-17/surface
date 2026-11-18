import { Hono, type Context } from "hono";
import { z } from "zod";
import { executeStatement } from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";

export const trackerRoutes = new Hono();
const applicationStatuses = [
  "To apply",
  "Applied",
  "In conversation",
  "Closed",
] as const;
const companyStatuses = [
  "Listed",
  "To research",
  "Outreach",
  "Archived",
] as const;
const optionalText = z.string().trim().max(4000).optional().default("");
const optionalDescription = z
  .string()
  .trim()
  .max(100_000)
  .optional()
  .default("");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Use a valid ISO date.");
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .default("")
  .refine((value) => {
    if (!value) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use a valid HTTP or HTTPS URL.");
const companyInput = z.object({
  name: z.string().trim().min(1).max(200),
  website: httpUrl,
  location: optionalText,
  status: z.enum(companyStatuses).default("Listed"),
  notes: optionalText,
});
const applicationInput = z.object({
  title: z.string().trim().min(1).max(200),
  companyId: z.string().min(1),
  status: z.enum(applicationStatuses).default("To apply"),
  type: z.enum(["Job", "Intern"]).optional().nullable(),
  description: optionalDescription,
  location: z.string().trim().max(500).optional().default(""),
  employmentType: z.string().trim().max(120).optional().default(""),
  workMode: z
    .enum(["remote", "hybrid", "onsite", "unknown"])
    .optional()
    .nullable(),
  compensation: z.string().trim().max(500).optional().default(""),
  sourceUrl: httpUrl,
  appliedOn: isoDate.optional().nullable(),
  contactedOn: isoDate.optional().nullable(),
  followUpOn: isoDate.optional().nullable(),
  contactName: z.string().trim().max(200).optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .max(320)
    .optional()
    .default("")
    .refine(
      (value) => !value || z.string().email().safeParse(value).success,
      "Use a valid contact email.",
    ),
  outcome: optionalText,
  notes: optionalText,
});
const patch = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial();
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues[0]?.message ?? "Invalid tracker data.",
    );
  return result.data;
}
async function readBody(context: Context) {
  try {
    return await context.req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

trackerRoutes.get("/companies", async (c) =>
  c.json(
    await executeStatement(
      `SELECT c.id,c.name,c.website,c.location,c.status,c.notes,c.created_at AS createdAt,c.updated_at AS updatedAt,COUNT(a.id) AS applicationCount FROM tracker_companies c LEFT JOIN tracker_applications a ON a.company_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC, c.id`,
    ),
  ),
);
trackerRoutes.post("/companies", async (c) => {
  const input = parse(companyInput, await readBody(c));
  const timestamp = now();
  const key = id();
  await executeStatement(
    `INSERT INTO tracker_companies(id,name,website,location,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
    [
      key,
      input.name,
      input.website,
      input.location,
      input.status,
      input.notes,
      timestamp,
      timestamp,
    ],
  );
  return c.json({ ...(await oneCompany(key)) }, 201);
});
trackerRoutes.patch("/companies/:id", async (c) => {
  const key = c.req.param("id");
  const current = await oneCompany(key);
  if (!current) throw new HttpError(404, "Company not found.");
  const input = parse(patch(companyInput.shape), await readBody(c));
  const columns: Record<string, string> = {
    name: "name",
    website: "website",
    location: "location",
    status: "status",
    notes: "notes",
  };
  const entries = Object.entries(input).filter(([field]) => field in columns);
  if (!entries.length)
    throw new HttpError(400, "No company fields were provided.");
  await executeStatement(
    `UPDATE tracker_companies SET ${entries.map(([field]) => `${columns[field]}=?`).join(",")},updated_at=? WHERE id=?`,
    [...entries.map(([, value]) => value), now(), key],
  );
  return c.json(await oneCompany(key));
});
trackerRoutes.delete("/companies/:id", async (c) => {
  const key = c.req.param("id");
  const result = await executeStatement<{ id: string }>(
    `DELETE FROM tracker_companies WHERE id=? RETURNING id`,
    [key],
  );
  if (!result.length) throw new HttpError(404, "Company not found.");
  return c.json({ ok: true });
});

trackerRoutes.get("/applications", async (c) =>
  c.json(
    await executeStatement(
      `SELECT a.id,a.title,a.company_id AS companyId,c.name AS companyName,a.status,a.type,a.description,a.location,a.employment_type AS employmentType,a.work_mode AS workMode,a.compensation,a.source_url AS sourceUrl,a.applied_on AS appliedOn,a.contacted_on AS contactedOn,a.follow_up_on AS followUpOn,a.contact_name AS contactName,a.contact_email AS contactEmail,a.outcome,a.notes,a.created_at AS createdAt,a.updated_at AS updatedAt FROM tracker_applications a JOIN tracker_companies c ON c.id=a.company_id ORDER BY a.updated_at DESC, a.id`,
    ),
  ),
);
trackerRoutes.post("/applications", async (c) => {
  const input = parse(applicationInput, await readBody(c));
  if (!(await oneCompany(input.companyId)))
    throw new HttpError(400, "Choose an existing company.");
  const key = id(),
    timestamp = now();
  await executeStatement(
    `INSERT INTO tracker_applications(id,title,company_id,status,type,description,location,employment_type,work_mode,compensation,source_url,applied_on,contacted_on,follow_up_on,contact_name,contact_email,outcome,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      key,
      input.title,
      input.companyId,
      input.status,
      input.type ?? null,
      input.description,
      input.location,
      input.employmentType,
      input.workMode ?? "unknown",
      input.compensation,
      input.sourceUrl,
      input.appliedOn ?? null,
      input.contactedOn ?? null,
      input.followUpOn ?? null,
      input.contactName,
      input.contactEmail,
      input.outcome,
      input.notes,
      timestamp,
      timestamp,
    ],
  );
  return c.json(await oneApplication(key), 201);
});
trackerRoutes.patch("/applications/:id", async (c) => {
  const key = c.req.param("id");
  const current = await oneApplication(key);
  if (!current) throw new HttpError(404, "Application not found.");
  const input = parse(patch(applicationInput.shape), await readBody(c));
  if (
    input.companyId !== undefined &&
    input.companyId !== String(current.companyId)
  ) {
    throw new HttpError(
      409,
      "An application's company cannot be changed after it is created.",
    );
  }
  const columns: Record<string, string> = {
    title: "title",
    status: "status",
    type: "type",
    description: "description",
    location: "location",
    employmentType: "employment_type",
    workMode: "work_mode",
    compensation: "compensation",
    sourceUrl: "source_url",
    appliedOn: "applied_on",
    contactedOn: "contacted_on",
    followUpOn: "follow_up_on",
    contactName: "contact_name",
    contactEmail: "contact_email",
    outcome: "outcome",
    notes: "notes",
  };
  const entries = Object.entries(input).filter(([field]) => field in columns);
  if (!entries.length)
    throw new HttpError(400, "No application fields were provided.");
  if (!entries.length)
    throw new HttpError(400, "No application fields were provided.");
  await executeStatement(
    `UPDATE tracker_applications SET ${entries.map(([field]) => `${columns[field]}=?`).join(",")},updated_at=? WHERE id=?`,
    [...entries.map(([, value]) => value), now(), key],
  );
  return c.json(await oneApplication(key));
});
trackerRoutes.delete("/applications/:id", async (c) => {
  const result = await executeStatement<{ id: string }>(
    `DELETE FROM tracker_applications WHERE id=? RETURNING id`,
    [c.req.param("id")],
  );
  if (!result.length) throw new HttpError(404, "Application not found.");
  return c.json({ ok: true });
});
async function oneCompany(key: string) {
  return (
    await executeStatement<Record<string, unknown>>(
      `SELECT c.id,c.name,c.website,c.location,c.status,c.notes,c.created_at AS createdAt,c.updated_at AS updatedAt,COUNT(a.id) AS applicationCount FROM tracker_companies c LEFT JOIN tracker_applications a ON a.company_id=c.id WHERE c.id=? GROUP BY c.id`,
      [key],
    )
  )[0];
}
async function oneApplication(key: string) {
  return (
    await executeStatement<Record<string, unknown>>(
      `SELECT a.id,a.title,a.company_id AS companyId,c.name AS companyName,a.status,a.type,a.description,a.location,a.employment_type AS employmentType,a.work_mode AS workMode,a.compensation,a.source_url AS sourceUrl,a.applied_on AS appliedOn,a.contacted_on AS contactedOn,a.follow_up_on AS followUpOn,a.contact_name AS contactName,a.contact_email AS contactEmail,a.outcome,a.notes,a.created_at AS createdAt,a.updated_at AS updatedAt FROM tracker_applications a JOIN tracker_companies c ON c.id=a.company_id WHERE a.id=?`,
      [key],
    )
  )[0];
}
