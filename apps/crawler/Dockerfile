FROM mcr.microsoft.com/playwright:v1.58.2-noble AS build
WORKDIR /app
COPY apps/crawler/package.json apps/crawler/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY apps/crawler/tsconfig.json ./
COPY apps/crawler/src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production CRAWLER_HOST=0.0.0.0 CRAWLER_PORT=4100
EXPOSE 4100
USER pwuser
CMD ["node", "dist/index.js"]
