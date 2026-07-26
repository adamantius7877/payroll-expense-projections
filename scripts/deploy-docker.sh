#!/usr/bin/env sh
set -eu

APP_PORT="${APP_PORT:-3001}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-change-this-local-password}"
export APP_PORT
export POSTGRES_PASSWORD

docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 payroll-expense-projections
