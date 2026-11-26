import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { safe } from "@/components/projects/procurement/data";
import type { Threshold } from "@/lib/procurement";
import Wizard from "@/components/procurement/Wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "شراء جديد — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export default async function NewPurchase() {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const t = today(), year = Number(t.slice(0, 4));
  const [th, bl, plan] = await Promise.all([
    safe<Threshold>(sb.from("procurement_threshold").select("id,method,min_value,max_value,currency,effective_from,effective_to,source,review_status").eq("threshold_kind", "method").limit(500)),
    safe<{ id: string; code: string; title_ar: string }>(sb.from("budget_line").select("id,code,title_ar").eq("kind", "expense").limit(500)),
    safe<{ id: string; title: string; estimated_value: number; currency: string }>(sb.from("procurement_plan_item").select("id,title,estimated_value,currency").eq("fiscal_year", year).limit(300)),
  ]);
  return (
    <><StaffHeader back="/staff/procurement" backLabel="الشراء العام" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">شراء جديد</h1>
      <Wizard thresholds={th.data} today={t} year={year} lines={bl.data} plan={plan.data} />
    </main></>
  );
}
