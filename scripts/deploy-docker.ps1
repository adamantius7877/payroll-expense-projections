$ErrorActionPreference = "Stop"

if (-not $env:APP_PORT) {
  $env:APP_PORT = "3001"
}

if (-not $env:POSTGRES_PASSWORD) {
  $env:POSTGRES_PASSWORD = "change-this-local-password"
}

docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 payroll-expense-projections
