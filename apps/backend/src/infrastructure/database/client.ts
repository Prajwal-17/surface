import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../../config/env";
import * as schema from "./schema";

export const pg = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle({ client: pg, schema });
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
