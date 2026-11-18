# Reset tracker data

The tracker uses `tracker_companies` and `tracker_applications` in the configured SQLite database (`SQLITE_DATABASE_FILE`, otherwise the app's `DATA_DIR/surface.sqlite3`). The explicit reset command clears only these two tables; the foreign key cascades applications when a company is deleted. Legacy tables, credentials, attachments, worker records, and external sources are not reset.

Stop every Surface process that can write to this database first. Run from the repository root:

```sh
CONFIRM_TRACKER_RESET=1 bun --cwd apps/backend db:reset-tracker
```

The command applies pending migrations, opens an immediate transaction, clears tracker data, and closes SQLite cleanly so WAL/SHM state is checkpointed/closed. Restart Surface and confirm both tracker tables are empty. Repeat for each deployment only after identifying that deployment's configured database. This command never accesses Notion.

