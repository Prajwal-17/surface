default:
    @just --list

# Install project dependencies.
install:
    bun install

# Start the existing shared Postgres container.
db-up:
    docker start primary-pg

# Apply production database migrations.
db-migrate-prod: db-up
    APP_ENV=production bun run db:migrate

# Apply development database migrations.
db-migrate-dev: db-up
    APP_ENV=development bun run db:migrate

# Open Drizzle Studio for the production database.
db-studio-prod: db-up
    APP_ENV=production bun run db:studio

# Open Drizzle Studio for the development database.
db-studio-dev: db-up
    APP_ENV=development bun run db:studio

# Generate the from-scratch SQLite migration baseline for the desktop app.
sqlite-generate:
    bun run db:generate:sqlite

# Verify the embedded SQLite backend in a new temporary profile.
sqlite-verify:
    bun run verify:sqlite

# Build the Electron desktop bundle and assets.
desktop-build:
    node apps/desktop/scripts/build.mjs

# Build the Ubuntu AppImage and Debian package.
desktop-package:
    cd apps/desktop && bun run package

# Build only the Ubuntu AppImage.
desktop-appimage:
    cd apps/desktop && bun run package:appimage

# Build only the Ubuntu Debian package.
desktop-deb:
    cd apps/desktop && bun run package:deb

# Start optional SearXNG only (no PostgreSQL or Surface containers).
searxng-up:
    docker compose -f compose.searxng.yaml up -d

# Stop the optional SearXNG stack.
searxng-down:
    docker compose -f compose.searxng.yaml down

# Start the production stack.
prod:
    docker compose up -d

# Stop the production stack.
prod-down:
    docker compose down

# Build and start the complete production stack.
prod-build:
    docker compose up --build -d

# Restart the production backend and web services.
prod-restart:
    docker compose restart backend web
