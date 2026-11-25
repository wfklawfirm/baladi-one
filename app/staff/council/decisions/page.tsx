import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import DecisionForm from "@/components/council/DecisionForm";
import { EXEC_STATUS, LEGAL_STATUS as LEGAL_RAW, decisionAlerts, isLate } from "@/lib/council";
import PageSummary, { type Todo } from "@/components/council/PageSummary";

/** Plain-language display labels (DB values unchanged). */
const LEGAL_STATUS: Record<string, string> = { ...LEGAL_RAW, pending_completion: "ينتظر استكمال الأوراق", under_review: "عند سلطة الرقابة", annulled: "مُلغى" };

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
  const { data: all } = await sb.from("municipal_decision").select("id,decision_no,year,title,decided_on,sent_on,received_on,validated_on,validation_level,category,legal_status,execution_status,execution_due,audit_bureau_required,audit_bureau_notice_on,tacit_notified_on,vote_for,vote_against").order("year", { ascending: false }).limit(500);
  const pool = all ?? [];
  const drafts = pool.filter((d) => d.legal_status === "draft");
  const waiting = pool.filter((d) => d.legal_status !== "draft" && d.legal_status !== "effective" && d.legal_status !== "annulled" && decisionAlerts({ ...d, audit_bureau_required: d.audit_bureau_required ?? false }, t).length > 0);
  const late = pool.filter((d) => isLate(d, t));
  const todos: Todo[] = [
    ...drafts.map((d) => ({ key: `d${d.id}`, text: `قرار ${d.decision_no}/${d.year} مسودة بانتظار الاعتماد`, sub: d.title, href: `/staff/council/decisions/${d.id}`, cta: "افتح", tone: "info" as const })),
    ...waiting.map((d) => ({ key: `w${d.id}`, text: `قرار ${d.decision_no}/${d.year} يحتاج متابعة`, sub: decisionAlerts(d, t)[0], href: `/staff/council/decisions/${d.id}`, cta: "تابع", tone: "bad" as const })),
    ...late.map((d) => ({ key: `l${d.id}`, text: `قرار ${d.decision_no}/${d.year} تأخر تنفيذه`, sub: d.title, href: `/staff/council/decisions/${d.id}`, cta: "افتح", tone: "warn" as const })),
  ];
  const filtered = !!(sp.l || sp.e || sp.q);
  const chip = (href: string, on: boolean, label: string) => <Link key={href} href={href} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{label}</Link>;
  return (
    <><StaffHeader back="/staff/council" backLabel="المجلس" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-bold">سجل القرارات</h1>
        <Link href="/staff/decisions" className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground active:opacity-90">+ إنشاء قرار</Link></div>
      <PageSummary headline={todos.length ? `${todos.length} من القرارات تنتظر إجراءً منكم.` : "لا قرار ينتظر إجراءً منكم الآن."} todos={todos} stats={[
        { label: "مسودات", value: drafts.length, tone: drafts.length ? "warn" : "ok", href: "/staff/council/decisions?l=draft" },
        { label: "تحتاج متابعة", value: waiting.length, tone: waiting.length ? "bad" : "ok" },
        { label: "متأخرة التنفيذ", value: late.length, tone: late.length ? "warn" : "ok" },
      ]} />
      <details open={filtered} className="rounded-2xl border bg-background p-4"><summary className="min-h-11 cursor-pointer py-2 font-bold text-primary">عرض التفاصيل: كل القرارات والبحث</summary><div className="mt-3 space-y-4">
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
      </div></details>
      <details className="elev rounded-2xl border bg-background p-4"><summary className="min-h-11 cursor-pointer py-2 font-bold text-primary">تسجيل قرار جديد (يدويًا)</summary><DecisionForm /></details>
    </main></>
  );
}
