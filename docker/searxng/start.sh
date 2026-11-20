#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine or Docker Desktop first." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but the daemon is not reachable. Start Docker and try again." >&2
  exit 1
fi

if [ ! -f .env ]; then
  secret="$(openssl rand -hex 32 2>/dev/null || node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  cp .env.example .env
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^SEARXNG_SECRET=.*|SEARXNG_SECRET=${secret}|" .env
  else
    sed -i '' "s|^SEARXNG_SECRET=.*|SEARXNG_SECRET=${secret}|" .env
  fi
  chmod 600 .env
  echo "Created .env with a random SearXNG secret."
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${SEARXNG_PORT:=8080}"
url="http://127.0.0.1:${SEARXNG_PORT}"

echo "Building and starting SearXNG on ${url} …"
docker compose up -d --build

ready=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 3 "${url}/search?q=surface&format=json" \
    2>/dev/null | grep -q '"results"'; then
    ready=1
    break
  fi
  sleep 1
done

if [ "${ready}" -ne 1 ]; then
  echo "SearXNG did not become ready in time. Recent logs:" >&2
  docker compose logs --tail=80 searxng >&2
  exit 1
fi

echo "SearXNG is ready with JSON search enabled: ${url}"
echo "Search URL for Surface: ${url}"

if [ -x ./configure-app.sh ]; then
  SEARXNG_PORT="${SEARXNG_PORT}" ./configure-app.sh || true
fi
