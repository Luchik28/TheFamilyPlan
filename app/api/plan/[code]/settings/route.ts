import { NextResponse } from "next/server";
import { ensureSchema, getPlanByCode, sql } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

// PUT /api/plan/:code/settings  ->  update plan-level settings (home address)
export async function PUT(req: Request, { params }: Params) {
  try {
    await ensureSchema();
    const { code } = await params;
    const plan = await getPlanByCode(code);
    if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const homeAddress = (data.home_address || "").trim();
    const homeLat = typeof data.home_lat === "number" ? data.home_lat : null;
    const homeLng = typeof data.home_lng === "number" ? data.home_lng : null;

    await sql`
      UPDATE plans SET
        home_address = ${homeAddress},
        home_lat     = ${homeLat},
        home_lng     = ${homeLng}
      WHERE id = ${plan.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("update settings failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
