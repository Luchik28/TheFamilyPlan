import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { CalendarEvent, ensureSchema, getPlanByCode } from "@/lib/db";
import { validateEvent } from "@/lib/events";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

// Monday of the week containing `ref` (defaults to today), as YYYY-MM-DD.
function weekRange(weekParam: string | null): { monday: string; sunday: string } {
  const ref = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
    ? new Date(`${weekParam}T00:00:00Z`)
    : new Date();
  // Use UTC math so the range is stable regardless of server timezone.
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  const monday = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const sunday = d.toISOString().slice(0, 10);
  return { monday, sunday };
}

// GET /api/plan/:code/events?week=YYYY-MM-DD
export async function GET(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const week = new URL(req.url).searchParams.get("week");
    const { monday, sunday } = weekRange(week);

    const { rows } = await sql<CalendarEvent>`
      SELECT * FROM events
      WHERE plan_id = ${plan.id} AND event_date BETWEEN ${monday} AND ${sunday}
      ORDER BY event_date, start_time
    `;

    return NextResponse.json({
      plan: { code: plan.code, name: plan.name },
      week_start: monday,
      events: rows,
    });
  } catch (err) {
    console.error("list events failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/plan/:code/events  -> add an event
export async function POST(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const check = validateEvent(data);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const { rows } = await sql<CalendarEvent>`
      INSERT INTO events (plan_id, title, event_date, start_time, end_time, person, color, notes)
      VALUES (
        ${plan.id},
        ${data.title.trim()},
        ${data.event_date},
        ${data.start_time},
        ${data.end_time},
        ${(data.person || "").trim()},
        ${data.color || "#4f7cff"},
        ${(data.notes || "").trim()}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("add event failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
