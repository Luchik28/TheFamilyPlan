import { sql } from "@vercel/postgres";

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
