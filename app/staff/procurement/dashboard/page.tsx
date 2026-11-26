import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import DashboardView from "@/components/procurement/DashboardView";
import { loadDashboard } from "@/lib/procurementStatsData";

export const dynamic = "force-dynamic";
export const metadata = { title: "لوحة الشراء التنفيذية — BALADI ONE", referrer: "no-referrer" as const };
const todayBeirut = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

/** Executive dashboard: real rows only, read through the caller's RLS, nothing written. */
export default async function ProcurementDashboard({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams, today = todayBeirut();
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(today.slice(0, 4));
  const { stats, unavailable } = await loadDashboard(sb, year, today);
  return (
    <><StaffHeader back="/staff/procurement" backLabel="إدارة الشراء العام" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header className="space-y-1"><h1 className="text-2xl font-bold">لوحة الشراء التنفيذية — {year}</h1>
        <p className="text-sm text-muted-foreground">أرقام حقيقية من سجلات البلدية؛ التقدير والعقد والمدفوع لا تُدمج، والعملات لا تُجمع.</p></header>
      <DashboardView s={stats} year={year} unavailable={unavailable} />
    </main></>
  );
}
