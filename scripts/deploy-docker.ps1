$ErrorActionPreference = "Stop"

if (-not $env:APP_PORT) {
  $env:APP_PORT = "3001"
}

if (-not $env:POSTGRES_PASSWORD) {
  $env:POSTGRES_PASSWORD = "change-this-local-password"
}

$backupDir = Join-Path (Get-Location) "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDir "payroll-expenses-$timestamp.sql"

$postgresRunning = docker compose ps --status running --services | Select-String -SimpleMatch "postgres"
if ($postgresRunning) {
  docker compose exec -T postgres pg_dump -U payroll_app -d payroll_expenses --clean --if-exists | Out-File -FilePath $backupPath -Encoding utf8
  Write-Host "Database backup saved to $backupPath"
} else {
  Write-Host "Postgres is not running yet; skipping pre-deploy database backup."
}

docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 payroll-expense-projections
