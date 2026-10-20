FROM oven/bun:1.4.1

WORKDIR /app

# Keep the workspace lockfile and package manifests available for a reproducible install.
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/crawler/package.json apps/crawler/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN bun install --frozen-lockfile --ignore-scripts

COPY apps/backend apps/backend
COPY packages packages

WORKDIR /app/apps/backend
ENV NODE_ENV=production \
    DB_FILE_NAME=/data/surface.sqlite \
    PORT=4000
EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]
