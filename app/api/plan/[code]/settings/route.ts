import { NextResponse } from "next/server";
import { DEFAULT_TIERS, ensureSchema, getPlanByCode, sql } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

// Sanitize an incoming priority_tiers array: at least one tier, positive finite
// weights, capped length. Falls back to the default when absent/invalid.
function cleanTiers(input: unknown): number[] {
  if (!Array.isArray(input)) return DEFAULT_TIERS;
  const tiers = input
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w > 0)
    .slice(0, 10);
  return tiers.length > 0 ? tiers : DEFAULT_TIERS;
}

// PUT /api/plan/:code/settings  ->  update plan-level settings (home + tiers)
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
    const tiers = cleanTiers(data.priority_tiers);

    await sql`
      UPDATE plans SET
        home_address   = ${homeAddress},
        home_lat       = ${homeLat},
        home_lng       = ${homeLng},
        priority_tiers = ${JSON.stringify(tiers)}::jsonb
      WHERE id = ${plan.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("update settings failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
