default:
    @just --list

# Install project dependencies.
install:
    bun install

# Launch the local Electron development app.
dev:
    bun dev

# Generate SQLite migrations.
sqlite-generate:
    bun run db:generate

# Verify the embedded SQLite backend in a new temporary profile.
sqlite-verify:
    bun run verify:sqlite

# Build the Electron desktop bundle and assets.
desktop-build:
    node apps/desktop/scripts/build.mjs

# Build the production Ubuntu AppImage and Debian package with checksums.
desktop-package:
    node scripts/desktop-release.mjs package

# Build the development Ubuntu AppImage and Debian package with checksums.
desktop-package-dev:
    node scripts/desktop-release.mjs package --channel development

# Build only the Ubuntu AppImage.
desktop-appimage:
    cd apps/desktop && bun run package:appimage

# Build only the Ubuntu Debian package.
desktop-deb:
    cd apps/desktop && bun run package:deb

# Preview the release notes for the current desktop version.
desktop-notes:
    node scripts/release-notes.mjs --check

# Start optional SearXNG for desktop search.
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
