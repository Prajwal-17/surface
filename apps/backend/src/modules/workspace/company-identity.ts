import { eq, sql } from "drizzle-orm";
import type { Transaction } from "../../infrastructure/database/client";
import { HttpError } from "../../shared/errors/http-error";
import { companies } from "./workspace.tables";

export async function resolveCompany(
  tx: Transaction,
  name: string,
  now: string,
  preferredId?: string | null,
) {
  if (preferredId) {
    const [preferred] = await tx
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, preferredId));
    if (!preferred) throw new HttpError(400, "Company not found.");
    return preferred;
  }

  const companyName = name.trim();
  if (!companyName) return null;
  const matches = await tx
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(sql`lower(trim(${companies.name})) = lower(${companyName})`)
    .limit(2);
  if (matches.length > 1) return null;
  if (matches[0]) return matches[0];

  const company = { id: crypto.randomUUID(), name: companyName };
  await tx.insert(companies).values({
    ...company,
    createdAt: now,
    updatedAt: now,
  });
  return company;
}
