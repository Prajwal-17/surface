FROM oven/bun:1.4.1 AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
COPY apps/backend apps/backend
COPY apps/web apps/web
COPY packages packages
RUN bun run --cwd apps/web build

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf.template /etc/nginx/surface.conf.template
COPY apps/web/configure-nginx.sh /docker-entrypoint.d/40-configure-nginx.sh
RUN chmod +x /docker-entrypoint.d/40-configure-nginx.sh

ENV BACKEND_URL=http://backend:4000
EXPOSE 17000
