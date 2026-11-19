#!/usr/bin/env bash
# Writes the local SearXNG URL into Surface's lead settings. This is optional:
# you can also set it in the Find leads settings card.
#
# On a fresh checkout, start Surface once so the backend creates lead_settings,
# then run this script (or just run ./start.sh again).
set -euo pipefail

PORT="${SEARXNG_PORT:-8080}"
URL="${SEARXNG_URL:-http://127.0.0.1:${PORT}}"
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}"

if [ -n "${SURFACE_DB:-}" ]; then
  DB_PATH="${SURFACE_DB}"
else
  DB_PATH=""
  for candidate in \
    "${CONFIG_ROOT}/Surface Dev/surface.sqlite3" \
    "${CONFIG_ROOT}/Surface/surface.sqlite3"; do
    if [ -f "${candidate}" ]; then
      DB_PATH="${candidate}"
      break
    fi
  done
fi

if [ -z "${DB_PATH}" ] || [ ! -f "${DB_PATH}" ]; then
  echo "Surface database not found. Start Surface once, then rerun this script,"
  echo "or set SURFACE_DB to the database path."
  exit 0
fi

node - "${DB_PATH}" "${URL}" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const dbPath = process.argv[2];
const url = process.argv[3];
const db = new DatabaseSync(dbPath);
const table = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lead_settings'")
  .get();
if (!table) {
  console.log(
    "Surface has not created the lead tables yet. Start the updated app once, then rerun ./start.sh.",
  );
  process.exit(0);
}
const current = db
  .prepare("SELECT product_context FROM lead_settings WHERE id='me'")
  .get();
db.prepare(
  `INSERT INTO lead_settings(id, searxng_url, product_context, updated_at)
   VALUES(?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET
     searxng_url=excluded.searxng_url,
     updated_at=excluded.updated_at`,
).run("me", url, current?.product_context ?? "", new Date().toISOString());
console.log(`Configured Surface lead settings (${dbPath}) -> ${url}`);
NODE
