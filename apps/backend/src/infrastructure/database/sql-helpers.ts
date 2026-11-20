import { sql, type Column, type SQL } from "drizzle-orm";

/** Case-insensitive literal substring match (no wildcard interpretation). */
export function containsText(
  column: Column | SQL,
  needle: string,
): SQL<boolean> {
  return sql<boolean>`instr(lower(${column}), lower(${needle})) > 0`;
}

/** Case-insensitive LIKE match; `%` and `_` retain wildcard semantics. */
export function containsPattern(
  column: Column | SQL,
  needle: string,
): SQL<boolean> {
  const pattern = `%${needle}%`;
  return sql<boolean>`lower(${column}) LIKE lower(${pattern})`;
}

export function countAsInteger(): SQL<number> {
  return sql<number>`CAST(count(*) AS INTEGER)`;
}

export function countWhereAsInteger(condition: SQL): SQL<number> {
  return sql<number>`CAST(count(*) FILTER (WHERE ${condition}) AS INTEGER)`;
}

/** Extracts a text-valued key from a JSON column on either dialect. */
export function jsonText(column: Column, key: string): SQL<string | null> {
  return sql<string | null>`json_extract(${column}, ${`$.${key}`})`;
}
