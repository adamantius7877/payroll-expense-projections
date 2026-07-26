import pg from "pg";

const { Pool } = pg;

const stateKey = "household-budget";

let pool: pg.Pool | null = null;
let initialized = false;

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  pool ??= new Pool({ connectionString });
  return pool;
}

async function ensureSchema() {
  if (initialized) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  initialized = true;
}

export async function readAppState() {
  await ensureSchema();
  const result = await getPool().query("SELECT data FROM app_state WHERE key = $1", [stateKey]);
  return result.rows[0]?.data ?? null;
}

export async function writeAppState(data: unknown) {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO app_state (key, data, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [stateKey, data],
  );
}
