import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("retiring research preserves existing referenced data", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE research_runs (id TEXT PRIMARY KEY);
      CREATE TABLE research_sources (id TEXT PRIMARY KEY, run_id TEXT REFERENCES research_runs(id));
      INSERT INTO research_runs VALUES ('run');
      INSERT INTO research_sources VALUES ('source', 'run');
    `);
    database.exec(readFileSync(new URL("../drizzle-sqlite/0006_melted_weapon_omega.sql", import.meta.url), "utf8"));
    assert.equal(database.prepare("SELECT count(*) AS count FROM research_sources").get().count, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
