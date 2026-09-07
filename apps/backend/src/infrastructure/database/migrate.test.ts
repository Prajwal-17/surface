import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(
  new URL("../../../drizzle", import.meta.url),
);

test("baseline seeds monitored feeds once and preserves source settings on rerun", () => {
  const sqlite = new Database(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder });
    const feeds = sqlite
      .query<
        {
          id: string;
          schedule_hours: number;
          created_at: string;
          next_due_at: string;
        },
        []
      >("SELECT * FROM configured_sources ORDER BY id")
      .all();
    expect(feeds.map((feed) => feed.id)).toEqual([
      "feed:arbeitnow",
      "feed:jobicy",
      "feed:remote-ok",
      "feed:remotive",
      "feed:we-work-remotely",
    ]);
    for (const feed of feeds) {
      expect(feed.schedule_hours).toBe(12);
      expect(
        Date.parse(feed.next_due_at) - Date.parse(feed.created_at),
      ).toBeCloseTo(12 * 60 * 60 * 1000, -2);
    }
    sqlite.exec(
      "UPDATE configured_sources SET paused = 1, schedule_hours = 24 WHERE id = 'feed:remotive'",
    );
    const before = sqlite
      .query("SELECT * FROM configured_sources ORDER BY id")
      .all();
    migrate(db, { migrationsFolder });
    expect(
      sqlite.query("SELECT * FROM configured_sources ORDER BY id").all(),
    ).toEqual(before);
    expect(
      sqlite.query("SELECT count(*) AS count FROM __drizzle_migrations").get(),
    ).toEqual({ count: 1 });
    expect(sqlite.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});
