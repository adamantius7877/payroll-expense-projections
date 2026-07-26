# Payroll Expense Projections

A private paycheck, bills, groceries, allowance, and expense projection dashboard.

The app intentionally ships with no real pay, bill, or expense data. Your data is entered or imported in the browser and saved in a shared Postgres database when deployed with Docker Compose.

## Run Locally

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Deploy With Docker Desktop On Windows

In PowerShell:

```powershell
git clone https://github.com/adamantius7877/payroll-expense-projections.git
cd payroll-expense-projections
$env:APP_PORT = "3001"
$env:POSTGRES_PASSWORD = "choose-a-local-password"
.\scripts\deploy-docker.ps1
```

Or run Docker Compose directly:

```powershell
git clone https://github.com/adamantius7877/payroll-expense-projections.git
cd payroll-expense-projections
$env:APP_PORT = "3001"
$env:POSTGRES_PASSWORD = "choose-a-local-password"
docker compose up -d --build
```

Open `http://localhost:3001` on that Windows machine. From another device on your network, open `http://WINDOWS_SERVER_IP:3001`.

The Postgres data is stored in the Docker volume named `payroll_expense_data`, so normal container rebuilds keep your saved dashboard data.

To update an existing Windows Docker deployment after pulling new code:

```powershell
git pull
$env:POSTGRES_PASSWORD = "choose-a-local-password"
docker compose up -d --build
```

## Deploy With Docker Compose On Linux

```bash
git clone https://github.com/adamantius7877/payroll-expense-projections.git
cd payroll-expense-projections
export POSTGRES_PASSWORD="choose-a-local-password"
APP_PORT=3001 ./scripts/deploy-docker.sh
```

Open `http://SERVER_IP:3001`, or change `APP_PORT` to expose a different host port.

## Data Privacy

- Do not commit exported JSON backups or CSV files with real budget data.
- Do not add real bill names, pay amounts, due dates, or expense amounts to source defaults.
- Shared dashboard data is stored in your Docker Postgres volume, not in Git.
