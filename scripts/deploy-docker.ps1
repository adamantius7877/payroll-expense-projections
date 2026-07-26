$ErrorActionPreference = "Stop"

if (-not $env:APP_PORT) {
  $env:APP_PORT = "3001"
}

docker compose build
docker compose up -d
docker compose ps
