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
