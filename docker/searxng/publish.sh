#!/usr/bin/env bash
set -euo pipefail

# Build the local image and push it to any registry you are logged in to.
#
# Usage:
#   ./publish.sh docker.io/<your-user>/surface-searxng:latest
#   ./publish.sh ghcr.io/<your-org>/surface-searxng:latest
#
# Authenticate first with `docker login` or `echo "$TOKEN" | docker login ghcr.io -u <user> --password-stdin`.
set -euo pipefail

cd "$(dirname "$0")"

set -a
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi
set +a

IMAGE="${1:-${SEARXNG_IMAGE:-}}"
if [ -z "${IMAGE}" ]; then
  echo "Usage: $0 <registry>/<namespace>/surface-searxng:<tag>" >&2
  echo "Example: $0 docker.io/example/surface-searxng:latest" >&2
  exit 1
fi

docker build \
  --build-arg "SEARXNG_VERSION=${SEARXNG_VERSION:-latest}" \
  -t surface-searxng:latest .
docker tag surface-searxng:latest "${IMAGE}"
docker push "${IMAGE}"
echo "Pushed ${IMAGE}"
