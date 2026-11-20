# SearXNG image tuned for Surface's local lead discovery backend.
#
# The base image is the official SearXNG image. The only additions are the
# instance settings and a small health check. Runtime secrets and the public
# base URL are supplied through environment variables (see compose.yaml).
ARG SEARXNG_VERSION=latest
FROM docker.io/searxng/searxng:${SEARXNG_VERSION}

LABEL org.opencontainers.image.title="Surface SearXNG"
LABEL org.opencontainers.image.description="Local SearXNG instance with JSON search enabled for Surface lead discovery."
LABEL org.opencontainers.image.source="https://github.com/surface/surface"

COPY --chmod=0644 config/settings.yml /etc/searxng/settings.yml

ENV SEARXNG_BASE_URL=http://127.0.0.1:8080/
ENV SEARXNG_LIMITER=false
ENV SEARXNG_IMAGE_PROXY=false

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/config', timeout=3)" || exit 1
