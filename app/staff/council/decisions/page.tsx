import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import DecisionForm from "@/components/council/DecisionForm";
import { EXEC_STATUS, LEGAL_STATUS, isLate } from "@/lib/council";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل القرارات — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export default async function Registry({ searchParams }: { searchParams: Promise<{ l?: string; e?: string; q?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  let q = sb.from("municipal_decision").select("id,decision_no,year,title,decided_on,legal_status,execution_status,execution_due,responsible,is_demo").order("year", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (sp.l && LEGAL_STATUS[sp.l]) q = q.eq("legal_status", sp.l);
  if (sp.e && EXEC_STATUS[sp.e]) q = q.eq("execution_status", sp.e);
  const { data } = await q;
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = (data ?? []).filter((r) => !needle || r.title.toLowerCase().includes(needle) || r.decision_no.toLowerCase().includes(needle));
  const t = today();
  const chip = (href: string, on: boolean, label: string) => <Link key={href} href={href} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{label}</Link>;
  return (
    <><StaffHeader back="/staff/council" backLabel="المجلس" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">سجل القرارات البلدية</h1>
      <p className="text-sm text-muted-foreground">الحالة القانونية (نافذ؟) منفصلة عن حالة التنفيذ (نُفّذ؟). اتخاذ القرار لا يعني نفاذه، ونفاذه لا يعني تنفيذه.</p>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{sp.err === "dup" ? "رقم القرار مستخدم في هذه السنة." : "تحقق من الحقول المطلوبة."}</p>}
      <form className="flex flex-wrap gap-2"><input name="q" defaultValue={sp.q} placeholder="بحث بالعنوان أو الرقم" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" />
        {sp.l && <input type="hidden" name="l" value={sp.l} />}{sp.e && <input type="hidden" name="e" value={sp.e} />}<button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">بحث</button></form>
      <div className="flex flex-wrap gap-2" aria-label="الحالة القانونية"><span className="self-center text-xs text-muted-foreground">قانونيًا:</span>{chip("/staff/council/decisions", !sp.l, "الكل")}{Object.entries(LEGAL_STATUS).map(([k, v]) => chip(`/staff/council/decisions?l=${k}`, sp.l === k, v))}</div>
      <div className="flex flex-wrap gap-2" aria-label="حالة التنفيذ"><span className="self-center text-xs text-muted-foreground">تنفيذًا:</span>{chip("/staff/council/decisions", !sp.e, "الكل")}{Object.entries(EXEC_STATUS).map(([k, v]) => chip(`/staff/council/decisions?e=${k}`, sp.e === k, v))}</div>
      <p className="text-sm text-muted-foreground">{rows.length} قرار</p>
      {rows.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا قرارات مسجّلة بعد.</p> : (
        <ul className="divide-y rounded-xl border bg-background">
          {rows.map((r) => <li key={r.id}><Link href={`/staff/council/decisions/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted">
            <b className="text-primary">{r.decision_no}/{r.year}</b><span className="font-medium">{r.title}</span>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary">{LEGAL_STATUS[r.legal_status]}</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">{EXEC_STATUS[r.execution_status]}</span>
            {isLate(r, t) && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-bold text-destructive">متأخر عن الموعد</span>}
            {r.is_demo && <span className="rounded bg-muted px-2 text-xs">تجريبي</span>}
            {r.responsible && <span className="ms-auto text-xs text-muted-foreground">{r.responsible}</span>}</Link></li>)}
        </ul>
      )}
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold text-primary">تسجيل قرار جديد</summary><DecisionForm /></details>
    </main></>
  );
}
