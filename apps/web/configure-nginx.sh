#!/bin/sh
set -eu

envsubst '${BACKEND_URL}' \
  < /etc/nginx/surface.conf.template \
  > /etc/nginx/conf.d/default.conf
