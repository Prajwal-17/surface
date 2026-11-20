# SearXNG for Surface lead discovery

This directory contains a self-hosted, loopback-only SearXNG instance built
from the official `searxng/searxng` image. It is configured for the Surface
backend's lead discovery module:

- JSON search output is enabled (`search.formats: [html, json]`).
- The rate limiter and image proxy are disabled because the instance is only
  reachable from `127.0.0.1`.
- Configuration is baked into a small `surface-searxng:latest` image, so there
  are no host-directory permission problems with `/etc/searxng`.
- The search cache lives in a named Docker volume.

## Start from inside the app

Surface can start and stop this container for you:

1. Open **Find leads**.
2. Open **Web search and offer context**.
3. Under **Local Docker SearXNG**, click **Start**.

The app creates a compose-managed `surface-searxng` container on
`http://127.0.0.1:8080`, waits for JSON search to respond, and saves that URL as
the active instance. If the local image is not installed, it pulls
`prajwalreddy17/surface-searxng:latest`. Click **Stop** in the same card to stop
it.

The generated runtime compose file lives in Surface's data directory as
`searxng-docker-compose.yaml`. It uses the same project and container names as
this directory, so the two start paths stay compatible.

## Quick start from a terminal

From the repository root:

```bash
bun run searxng:start
```

Or:

```bash
docker/searxng/start.sh
```

The script:

1. Creates `docker/searxng/.env` with a random `SEARXNG_SECRET` if needed.
2. Builds the image and starts the container on `http://127.0.0.1:8080`.
3. Waits for a JSON search response.
4. Writes `http://127.0.0.1:8080` into Surface's local lead settings when the
   database already has the lead tables.

Equivalent manual command:

```bash
cd docker/searxng
docker compose up -d --build
```

Then open Surface → **Find leads** → **Web search and offer context** and use:

```text
http://127.0.0.1:8080
```

## Verify

```bash
curl -fsS 'http://127.0.0.1:8080/search?q=developer+tools&format=json' | head -c 500
```

A JSON object containing `"results"` means the backend can use the instance.
You can also click **Check connection** in the Find leads settings card.

## Stop / restart / logs

```bash
docker/searxng/stop.sh          # stop and remove the container, keep cache
docker/searxng/start.sh         # rebuild if needed and start again
docker compose -f docker/searxng/compose.yaml logs -f searxng
```

To pick up a newer official SearXNG image:

```bash
cd docker/searxng
SEARXNG_VERSION=latest docker compose build --pull
docker compose up -d
```

## Configuration

- `config/settings.yml` — trimmed SearXNG settings using
  `use_default_settings: true`.
- `compose.yaml` — builds/runs `surface-searxng:latest`, publishes only on
  `127.0.0.1`, and supplies the runtime secret and base URL.
- `.env` — generated locally and ignored by git. `.env.example` documents the
  variables.
- `Dockerfile` — official image plus the local settings and a health check.

The default port is `8080`. Change `SEARXNG_PORT` in `.env` and rerun
`./start.sh`; then update the URL in Find leads (or run
`SEARXNG_PORT=<port> ./configure-app.sh`).

## Publish the image

The image is built locally as `surface-searxng:latest`. To upload it to Docker
Hub, GHCR, or another registry:

```bash
docker login
docker/searxng/publish.sh docker.io/<your-user>/surface-searxng:latest
```

Or with GHCR:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-user> --password-stdin
docker/searxng/publish.sh ghcr.io/<your-org>/surface-searxng:latest
```

The publish script only tags and pushes; it never stores credentials. If your
registry needs a different image name at build time, change `image:` in
`compose.yaml` or tag the built image manually.

## Troubleshooting

**Search returns HTML / "JSON is not enabled"**

- Confirm the request includes `format=json`.
- Confirm `config/settings.yml` still lists `json` under `search.formats`, then
  rebuild: `docker compose build --no-cache && docker compose up -d`.

**Port 8080 is already in use**

- Set `SEARXNG_PORT=8081` in `.env`, rerun `./start.sh`, and use
  `http://127.0.0.1:8081` in Surface.

**Engines return CAPTCHAs or block requests**

- This is an upstream engine behavior, not a Surface bug. Try another query,
  wait a few minutes, or configure a SearXNG engine/instance that permits your
  network. The backend reports upstream failures as run events.

**Container restarts or config errors**

```bash
docker compose -f docker/searxng/compose.yaml logs --tail=100 searxng
```

**Reset the cache**

```bash
cd docker/searxng
docker compose down -v
```
