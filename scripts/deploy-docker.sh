#!/usr/bin/env sh
set -eu

APP_PORT="${APP_PORT:-3001}"
export APP_PORT

docker compose build
docker compose up -d
docker compose ps
