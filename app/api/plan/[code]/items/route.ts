import { NextResponse } from "next/server";
import {
  ScheduleItem,
  ScheduleItemWithPerson,
  ensureSchema,
  getPersonInPlan,
  getPlanByCode,
  sql,
} from "@/lib/db";
import { validateItem, weekRange } from "@/lib/schedule";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

// GET /api/plan/:code/items?week=YYYY-MM-DD
export async function GET(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const week = new URL(req.url).searchParams.get("week");
    const { start, end } = weekRange(week);

    const { rows } = await sql<ScheduleItemWithPerson>`
      SELECT
        i.*,
        p.name  AS person_name,
        p.role  AS person_role,
        p.color AS person_color
      FROM schedule_items i
      JOIN people p ON p.id = i.person_id
      WHERE i.plan_id = ${plan.id} AND i.event_date BETWEEN ${start} AND ${end}
      ORDER BY i.event_date, i.start_time
    `;

    return NextResponse.json({
      plan: {
        code: plan.code,
        name: plan.name,
        home_address: plan.home_address ?? "",
        home_lat: plan.home_lat ?? null,
        home_lng: plan.home_lng ?? null,
      },
      week_start: start,
      items: rows,
    });
  } catch (err) {
    console.error("list items failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/plan/:code/items  -> add a kid "need" or driver "availability"
export async function POST(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const person = await getPersonInPlan(plan.id, Number(data.person_id));
    if (!person) {
      return NextResponse.json({ error: "Unknown person." }, { status: 400 });
    }

    const check = validateItem(person.role, data);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // Kids are points in time, so they never carry an end time.
    const endTime = person.role === "driver" ? data.end_time : null;

    const tripType = person.role === "kid" && data.trip_type === "pickup" ? "pickup" : "dropoff";

    const lat = typeof data.lat === "number" ? data.lat : null;
    const lng = typeof data.lng === "number" ? data.lng : null;
    const travelMins = person.role === "kid" && Number.isInteger(Number(data.travel_mins)) && Number(data.travel_mins) > 0
      ? Number(data.travel_mins) : null;

    const { rows } = await sql<ScheduleItem>`
      INSERT INTO schedule_items
        (plan_id, person_id, event_date, start_time, end_time, location, lat, lng, travel_mins, notes, trip_type)
      VALUES (
        ${plan.id},
        ${person.id},
        ${data.event_date},
        ${data.start_time},
        ${endTime},
        ${(data.location || "").trim()},
        ${lat},
        ${lng},
        ${travelMins},
        ${(data.notes || "").trim()},
        ${tripType}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("add item failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
