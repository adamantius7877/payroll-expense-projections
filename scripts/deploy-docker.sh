#!/usr/bin/env sh
set -eu

APP_PORT="${APP_PORT:-3000}"
export APP_PORT

docker compose build
docker compose up -d
docker compose ps
