import { notFound } from "next/navigation";
import { ensureSchema, getPlanByCode } from "@/lib/db";
import Calendar from "@/components/Calendar";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await ensureSchema();
  const plan = await getPlanByCode(code);
  if (!plan) notFound();

  return <Calendar code={plan.code} name={plan.name} />;
}
