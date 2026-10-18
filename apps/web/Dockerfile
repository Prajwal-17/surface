FROM oven/bun:1.4.1 AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/crawler/package.json apps/crawler/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
COPY apps/backend apps/backend
COPY apps/web apps/web
ENV BACKEND_URL=http://backend:4000 \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/web build

FROM dependencies AS runtime
WORKDIR /app/apps/web
COPY --from=build /app/apps/web/.next ./.next
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/next.config.js ./next.config.js

ENV NODE_ENV=production \
    BACKEND_URL=http://backend:4000 \
    NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

CMD ["bun", "run", "start"]
