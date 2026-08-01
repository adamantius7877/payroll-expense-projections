#!/usr/bin/env sh
set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

APP_PORT="${APP_PORT:-3001}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-change-this-local-password}"
export APP_PORT
export POSTGRES_PASSWORD

if [ "$POSTGRES_PASSWORD" = "change-this-local-password" ]; then
  echo "POSTGRES_PASSWORD is still set to the default. Set a real POSTGRES_PASSWORD in .env before deploying." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$BACKUP_DIR"
BACKUP_PATH="$BACKUP_DIR/payroll-expenses-$(date +%Y%m%d-%H%M%S).sql"

if docker compose ps --status running --services | grep -qx "postgres"; then
  docker compose exec -T postgres pg_dump -U payroll_app -d payroll_expenses --clean --if-exists > "$BACKUP_PATH"
  echo "Database backup saved to $BACKUP_PATH"
else
  echo "Postgres is not running yet; skipping pre-deploy database backup."
fi

docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 payroll-expense-projections
