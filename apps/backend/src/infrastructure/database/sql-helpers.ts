import { sql, type Column, type SQL } from "drizzle-orm";
import { databaseDialect } from "./client";

const sqlite = databaseDialect() === "sqlite";

/** Case-insensitive literal substring match (no wildcard interpretation). */
export function containsText(
  column: Column | SQL,
  needle: string,
): SQL<boolean> {
  return sqlite
    ? sql<boolean>`instr(lower(${column}), lower(${needle})) > 0`
    : sql<boolean>`strpos(lower(${column}), lower(${needle})) > 0`;
}

/** Case-insensitive LIKE match; `%` and `_` retain wildcard semantics. */
export function containsPattern(
  column: Column | SQL,
  needle: string,
): SQL<boolean> {
  const pattern = `%${needle}%`;
  return sqlite
    ? sql<boolean>`lower(${column}) LIKE lower(${pattern})`
    : sql<boolean>`${column} ILIKE ${pattern}`;
}

export function countAsInteger(): SQL<number> {
  return sql<number>`CAST(count(*) AS INTEGER)`;
}

export function countWhereAsInteger(condition: SQL): SQL<number> {
  return sql<number>`CAST(count(*) FILTER (WHERE ${condition}) AS INTEGER)`;
}

/** Extracts a text-valued key from a JSON column on either dialect. */
export function jsonText(column: Column, key: string): SQL<string | null> {
  return sqlite
    ? sql<string | null>`json_extract(${column}, ${`$.${key}`})`
    : sql<string | null>`${column} ->> ${key}`;
}
