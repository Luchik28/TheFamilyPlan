import { NextResponse } from "next/server";
import { Person, ensureSchema, getPlanByCode, sql } from "@/lib/db";
import { validatePerson } from "@/lib/schedule";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string; id: string }> };

// PUT /api/plan/:code/people/:id  -> rename / recolor / change role
export async function PUT(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code, id } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const check = validatePerson(data);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const tier = Number.isInteger(data.tier) ? Number(data.tier) : null;
    const { rows } = await sql<Person>`
      UPDATE people SET
        name = ${data.name.trim()},
        role = ${data.role},
        color = ${data.color || "#4f7cff"},
        tier = ${tier}
      WHERE id = ${Number(id)} AND plan_id = ${plan.id}
      RETURNING id, plan_id, name, role, color, tier
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("update person failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/plan/:code/people/:id  -> also removes that person's items (cascade)
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code, id } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    await sql`DELETE FROM people WHERE id = ${Number(id)} AND plan_id = ${plan.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete person failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
