import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { env } from "../../config/env";
import * as schema from "./schema";

mkdirSync(dirname(env.DB_FILE_NAME), { recursive: true });

export const sqlite = new Database(env.DB_FILE_NAME, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec("PRAGMA busy_timeout = 5000;");

export const db = drizzle({ client: sqlite, schema });
export type DatabaseClient = typeof db;
