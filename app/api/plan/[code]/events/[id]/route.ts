import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { CalendarEvent, ensureSchema, getPlanByCode } from "@/lib/db";
import { validateEvent } from "@/lib/events";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string; id: string }> };

// PUT /api/plan/:code/events/:id  -> update an event
export async function PUT(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code, id } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const check = validateEvent(data);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const { rows } = await sql<CalendarEvent>`
      UPDATE events SET
        title = ${data.title.trim()},
        event_date = ${data.event_date},
        start_time = ${data.start_time},
        end_time = ${data.end_time},
        person = ${(data.person || "").trim()},
        color = ${data.color || "#4f7cff"},
        notes = ${(data.notes || "").trim()}
      WHERE id = ${Number(id)} AND plan_id = ${plan.id}
      RETURNING *
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "event not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("update event failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/plan/:code/events/:id
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code, id } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    await sql`DELETE FROM events WHERE id = ${Number(id)} AND plan_id = ${plan.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete event failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
