import { NextResponse } from "next/server";
import { ensureSchema, getPlanByCode, sql } from "@/lib/db";
import { generateCode } from "@/lib/events";

export const runtime = "nodejs";

// POST /api/plan  ->  create a new shared plan, returns its access code
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const name = (body.name || "Our Plan").toString().trim().slice(0, 60) || "Our Plan";

    let code = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateCode();
      if (!(await getPlanByCode(candidate))) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return NextResponse.json({ error: "Could not generate code" }, { status: 500 });
    }

    await sql`INSERT INTO plans (code, name) VALUES (${code}, ${name})`;
    return NextResponse.json({ code, name }, { status: 201 });
  } catch (err) {
    console.error("create plan failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
