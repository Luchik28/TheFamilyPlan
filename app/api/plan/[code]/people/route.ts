import { NextResponse } from "next/server";
import { Person, ensureSchema, getPlanByCode, sql } from "@/lib/db";
import { validatePerson } from "@/lib/schedule";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

// GET /api/plan/:code/people  -> all drivers and kids in the plan
export async function GET(_req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { rows } = await sql<Person>`
      SELECT id, plan_id, name, role, color, tier
      FROM people WHERE plan_id = ${plan.id}
      ORDER BY role, name
    `;
    return NextResponse.json({ people: rows });
  } catch (err) {
    console.error("list people failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/plan/:code/people  -> add a driver or kid
export async function POST(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const check = validatePerson(data);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const tier = Number.isInteger(data.tier) ? Number(data.tier) : null;
    const { rows } = await sql<Person>`
      INSERT INTO people (plan_id, name, role, color, tier)
      VALUES (
        ${plan.id},
        ${data.name.trim()},
        ${data.role},
        ${data.color || "#4f7cff"},
        ${tier}
      )
      RETURNING id, plan_id, name, role, color, tier
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("add person failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
