import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل تجربة المساعد — BALADI ONE", referrer: "no-referrer" as const, robots: { index: false } };
type Lead = { id: string; full_name: string | null; phone: string; created_at: string; expires_at: string; question_count: number; last_used_at: string | null; status: string };
const fmt = (d: string | null) => d ? new Intl.DateTimeFormat("ar-LB", { timeZone: "Asia/Beirut", dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }).format(new Date(d)) : "—";

/** Platform-owner (WFK account) only: the database RPC refuses everyone else, so this page is a courtesy redirect, not the gate. */
export default async function TrialLeads() {
  const { sb } = await requireStaff();
  const { data: owner } = await sb.rpc("is_platform_owner");
  if (owner !== true) redirect("/staff");
  const { data, error } = await sb.rpc("trial_leads");
  const rows = (data ?? []) as Lead[];
  const active = rows.filter((r) => r.status === "active").length;
  return (
    <><StaffHeader back="/staff/admin" backLabel="الإدارة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">سجل المسجّلين لتجربة المساعد الذكي</h1>
      <p className="text-sm leading-6 text-muted-foreground">يظهر هذا السجل لحساب WFK فقط. كل مسجّل لديه تجربة {3} أيام من لحظة تسجيله، وبحدّ 25 سؤالًا يوميًا. أرقام الهواتف بيانات شخصية؛ لا تُشارَك.</p>
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">تعذّر تحميل السجل.</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm"><span className="rounded-full bg-accent px-3 py-1 font-bold text-primary">{rows.length} مسجّل</span><span className="rounded-full bg-muted px-3 py-1 font-bold">{active} تجربة سارية</span>
        <Link href="/staff/admin/trial-leads/export" prefetch={false} className="ms-auto min-h-11 rounded-xl border-2 px-4 py-2.5 font-semibold active:bg-muted">تنزيل CSV</Link></div>
      {rows.length === 0 ? <p className="rounded-2xl border p-6 text-center text-muted-foreground">لا يوجد مسجّلون بعد.</p> : (
        <div className="overflow-x-auto rounded-2xl border bg-background"><table className="w-full text-sm"><thead className="bg-muted text-start"><tr>{["الاسم", "الهاتف", "تاريخ التسجيل", "تنتهي في", "الأسئلة", "آخر استعمال", "الحالة"].map((h) => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t"><td className="p-3">{r.full_name ?? "—"}</td><td className="p-3" dir="ltr"><a href={`tel:+${r.phone}`} className="font-semibold text-primary">+{r.phone}</a></td><td className="p-3">{fmt(r.created_at)}</td><td className="p-3">{fmt(r.expires_at)}</td><td className="p-3">{r.question_count}</td><td className="p-3">{fmt(r.last_used_at)}</td>
              <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.status === "active" ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}>{r.status === "active" ? "سارية" : "منتهية"}</span></td></tr>))}</tbody></table></div>)}
    </main></>
  );
}
