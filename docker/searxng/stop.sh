#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

set -a
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi
set +a

docker compose down "$@"
echo "SearXNG stopped. The named cache volume is kept for fast restarts."
