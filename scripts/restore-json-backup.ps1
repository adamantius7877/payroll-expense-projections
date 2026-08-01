param(
  [string]$JsonPath = (Join-Path (Get-Location) "backups\pay-schedule-dashboard.json")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $JsonPath)) {
  throw "JSON backup was not found at: $JsonPath"
}

$backupDir = Join-Path (Get-Location) "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$sqlBackupPath = Join-Path $backupDir "before-json-restore-$timestamp.sql"

Write-Host "Stopping app container so it cannot overwrite the restore..."
docker compose stop payroll-expense-projections

Write-Host "Saving current database snapshot to $sqlBackupPath..."
docker compose exec -T postgres pg_dump -U payroll_app -d payroll_expenses --clean --if-exists | Out-File -FilePath $sqlBackupPath -Encoding utf8

Write-Host "Reading JSON backup from $JsonPath..."
$parsed = Get-Content -LiteralPath $JsonPath -Raw | ConvertFrom-Json
$propertyNames = @($parsed.PSObject.Properties.Name)
$payload = if ($propertyNames -contains "state") { $parsed.state } else { $parsed }
$compactJson = $payload | ConvertTo-Json -Depth 100 -Compress
$escapedJson = $compactJson.Replace("'", "''")

$sql = @"
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_state (key, data, updated_at)
VALUES ('household-budget', '$escapedJson'::jsonb, NOW())
ON CONFLICT (key)
DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
"@

Write-Host "Restoring dashboard state into Postgres..."
$sql | docker compose exec -T postgres psql -U payroll_app -d payroll_expenses

Write-Host "Starting app container..."
docker compose start payroll-expense-projections

Write-Host "Restore complete. Refresh the dashboard to verify your data is back."
