import {
  createPool,
  type QueryResult,
  type QueryResultRow,
  type VercelPool,
} from "@vercel/postgres";

// @vercel/postgres does not export its `Primitive` value type, so mirror it.
type Primitive = string | number | boolean | undefined | null;

// Accept whatever connection variable the chosen provider injects. Vercel's
// Neon integration sets POSTGRES_URL; some providers only set DATABASE_URL.
// Falling back across both means the app connects without manual env tweaking.
function resolveConnectionString(): string | undefined {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

// Lazily create the pool on first query (not at import time) so the build and
// any non-DB pages don't blow up when no connection string is configured yet.
let pool: VercelPool | null = null;
function getPool(): VercelPool {
  if (!pool) {
    pool = createPool({ connectionString: resolveConnectionString() });
  }
  return pool;
}

// A `sql` tagged-template that routes through our lazily-resolved pool.
export function sql<O extends QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: Primitive[]
): Promise<QueryResult<O>> {
  return getPool().sql<O>(strings, ...values);
}

export type Plan = {
  id: number;
  code: string;
  name: string;
};

export type CalendarEvent = {
  id: number;
  plan_id: number;
  title: string;
  event_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  person: string;
  color: string;
  notes: string;
};

// Create the schema once per warm serverless instance. CREATE TABLE IF NOT
// EXISTS is idempotent, so this is safe to await on every request path.
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS plans (
          id          SERIAL PRIMARY KEY,
          code        TEXT UNIQUE NOT NULL,
          name        TEXT NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS events (
          id          SERIAL PRIMARY KEY,
          plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
          title       TEXT NOT NULL,
          event_date  TEXT NOT NULL,
          start_time  TEXT NOT NULL,
          end_time    TEXT NOT NULL,
          person      TEXT NOT NULL DEFAULT '',
          color       TEXT NOT NULL DEFAULT '#4f7cff',
          notes       TEXT NOT NULL DEFAULT ''
        )
      `;
    })().catch((err) => {
      // Reset so a later request can retry schema creation.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export async function getPlanByCode(code: string): Promise<Plan | null> {
  const { rows } = await sql<Plan>`
    SELECT id, code, name FROM plans WHERE code = ${code.toUpperCase()}
  `;
  return rows[0] ?? null;
}
