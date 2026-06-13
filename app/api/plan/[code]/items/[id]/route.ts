import { NextResponse } from "next/server";
import {
  ScheduleItem,
  ensureSchema,
  getPersonInPlan,
  getPlanByCode,
  sql,
} from "@/lib/db";
import { validateItem } from "@/lib/schedule";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string; id: string }> };

// PUT /api/plan/:code/items/:id  -> edit a need / availability
export async function PUT(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code, id } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const person = await getPersonInPlan(plan.id, Number(data.person_id));
    if (!person) {
      return NextResponse.json({ error: "Unknown person." }, { status: 400 });
    }

    const check = validateItem(person.role, data);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const endTime = person.role === "driver" ? data.end_time : null;

    const { rows } = await sql<ScheduleItem>`
      UPDATE schedule_items SET
        person_id = ${person.id},
        event_date = ${data.event_date},
        start_time = ${data.start_time},
        end_time = ${endTime},
        location = ${(data.location || "").trim()},
        notes = ${(data.notes || "").trim()}
      WHERE id = ${Number(id)} AND plan_id = ${plan.id}
      RETURNING *
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "item not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("update item failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/plan/:code/items/:id
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code, id } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    await sql`DELETE FROM schedule_items WHERE id = ${Number(id)} AND plan_id = ${plan.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete item failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
