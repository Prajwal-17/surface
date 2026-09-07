FROM oven/bun:1.4.1 AS bun
FROM node:24-bookworm-slim AS dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .

FROM dependencies AS backend
WORKDIR /app/apps/backend
ENV NODE_ENV=production DB_FILE_NAME=/data/job-search.sqlite PORT=4000
EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]

FROM dependencies AS web-build
ENV BACKEND_URL=http://backend:4000 NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/web build

FROM web-build AS web
WORKDIR /app/apps/web
ENV NODE_ENV=production BACKEND_URL=http://backend:4000 NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["bun", "run", "start"]
