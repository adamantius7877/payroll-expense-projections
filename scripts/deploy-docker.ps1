$ErrorActionPreference = "Stop"

$envPath = Join-Path (Get-Location) ".env"
if (Test-Path -LiteralPath $envPath) {
  Get-Content -LiteralPath $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $name, $value = $line.Split("=", 2)
    $name = $name.Trim()
    $value = $value.Trim().Trim('"').Trim("'")
    if ($name) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

if (-not $env:APP_PORT) {
  $env:APP_PORT = "3001"
}

if (-not $env:POSTGRES_PASSWORD) {
  $env:POSTGRES_PASSWORD = "change-this-local-password"
}

if ($env:POSTGRES_PASSWORD -eq "change-this-local-password") {
  throw "POSTGRES_PASSWORD is still set to the default. Set a real POSTGRES_PASSWORD in .env before deploying."
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
