import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { safe } from "@/components/projects/procurement/data";
import { PLAN_STATUS } from "@/lib/procurement";
import { fmtMoney } from "@/lib/procurementAudit";

export const dynamic = "force-dynamic";
export const metadata = { title: "الملفات الرقابية — BALADI ONE", referrer: "no-referrer" as const };

export default async function AuditPackIndex({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date()).slice(0, 4));
  const r = await safe<{ id: string; title: string; estimated_value: number; currency: string; status: string }>(sb.from("procurement_plan_item").select("id,title,estimated_value,currency,status").eq("fiscal_year", year).order("created_at", { ascending: false }).limit(300));
  return (
    <><StaffHeader back="/staff/procurement" backLabel="إدارة الشراء العام" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">تصدير الملف الرقابي الكامل</h1>
      <p className="text-sm text-muted-foreground">اختر بندًا من خطة {year} لفتح ملفه الرقابي (قراءة فقط؛ لا يُعدَّل شيء). النسخة القابلة للمشاركة تحجب أسعار العروض وتصاريح تعارض المصالح.</p>
      {r.missing ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">تعذّرت قراءة خطة الشراء (الجدول غير متاح).</p>
        : r.data.length === 0 ? <p className="rounded-xl border p-4 text-sm">لا بيانات</p>
        : <ul className="space-y-2">{r.data.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4"><div><b>{p.title}</b><p className="text-sm text-muted-foreground">{fmtMoney(p.estimated_value, p.currency)} · {PLAN_STATUS[p.status] ?? p.status}</p></div>
            <div className="flex gap-2 text-sm font-semibold"><Link className="min-h-11 rounded-xl border px-3 py-2 active:bg-muted" href={`/staff/procurement/audit-pack/${p.id}`}>داخلي</Link><Link className="min-h-11 rounded-xl border px-3 py-2 active:bg-muted" href={`/staff/procurement/audit-pack/${p.id}?v=shareable`}>قابل للمشاركة</Link></div></li>))}</ul>}
    </main></>
  );
}
