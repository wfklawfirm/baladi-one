import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { SESSION_STATUS, decisionAlerts, uuidOk } from "@/lib/council";
import PageSummary, { type Todo } from "@/components/council/PageSummary";
import { createSession } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "المجلس والحوكمة — BALADI ONE", referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "long", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default async function Council({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data, error } = await sb.from("council_session").select("id,session_no,title,held_on,status,is_demo").order("held_on", { ascending: false }).limit(100);
  const rows = data ?? [];
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const { data: dd } = await sb.from("municipal_decision").select("id,decision_no,year,title,decided_on,sent_on,received_on,validated_on,validation_level,category,legal_status,audit_bureau_required,audit_bureau_notice_on,tacit_notified_on,vote_for,vote_against").neq("legal_status", "effective").neq("legal_status", "annulled").limit(300);
  const decs = (dd ?? []).filter((d) => uuidOk(d.id));
  const live = rows.filter((r) => r.status !== "cancelled");
  const upcoming = live.filter((r) => r.status === "planned" && r.held_on >= t);
  const todos: Todo[] = [
    ...live.filter((r) => r.status === "planned" && r.held_on < t).map((r) => ({ key: `s${r.id}`, text: `جلسة «${r.title}» مضى موعدها`, sub: "سجّل انعقادها والحضور والتصويت", href: `/staff/council/${r.id}`, cta: "سجّل الانعقاد", tone: "warn" as const })),
    ...live.filter((r) => r.status === "held").map((r) => ({ key: `h${r.id}`, text: `جلسة «${r.title}» انعقدت ولا محضر لها`, sub: "اكتب المحضر ثم اعتمده", href: `/staff/council/${r.id}/votes/minutes`, cta: "اكتب المحضر", tone: "warn" as const })),
    ...live.filter((r) => r.status === "minutes_draft").map((r) => ({ key: `m${r.id}`, text: `محضر «${r.title}» جاهز للاعتماد`, href: `/staff/council/${r.id}/votes/minutes`, cta: "راجع واعتمد", tone: "info" as const })),
    ...decs.filter((d) => d.legal_status === "draft").map((d) => ({ key: `d${d.id}`, text: `قرار ${d.decision_no}/${d.year} مسودة بانتظار الاعتماد`, sub: d.title, href: `/staff/council/decisions/${d.id}`, cta: "افتح", tone: "info" as const })),
    ...decs.filter((d) => d.legal_status !== "draft" && decisionAlerts({ ...d, audit_bureau_required: d.audit_bureau_required ?? false }, t).length > 0).map((d) => ({ key: `a${d.id}`, text: `قرار ${d.decision_no}/${d.year} يحتاج متابعة`, sub: decisionAlerts(d, t)[0], href: `/staff/council/decisions/${d.id}`, cta: "تابع", tone: "bad" as const })),
  ];
  const drafts = decs.filter((d) => d.legal_status === "draft").length;
  const follow = todos.filter((x) => x.key.startsWith("a")).length;
  const headline = error ? "تعذّر تحميل بيانات المجلس." : todos.length ? `لديكم ${todos.length} ${todos.length === 1 ? "بند" : "بنود"} تنتظر إجراءً من المجلس والقرارات.` : "لا شيء ينتظر إجراءً من المجلس الآن.";
  return (
    <><StaffHeader back="/staff/operations" backLabel="مركز القيادة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-bold">المجلس والقرارات</h1>
        <Link href="/staff/decisions" className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground active:opacity-90">+ إنشاء قرار</Link></div>
      <PageSummary headline={headline} todos={todos} stats={[
        { label: "جلسات مقبلة", value: error ? "غير متاح" : upcoming.length },
        { label: "قرارات مسودة", value: error ? "غير متاح" : drafts, tone: drafts ? "warn" : "ok", href: "/staff/council/decisions?l=draft" },
        { label: "قرارات تحتاج متابعة", value: error ? "غير متاح" : follow, tone: follow ? "bad" : "ok", href: "/staff/council/decisions" },
      ]} />
      {error && <p role="alert" className="rounded-xl border p-3 text-sm">تعذّر تحميل الجلسات.</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تحقق من العنوان والتاريخ ثم أعد المحاولة.</p>}
      <details className="rounded-2xl border bg-background p-4"><summary className="min-h-11 cursor-pointer py-2 font-bold text-primary">عرض التفاصيل: كل الجلسات وسجل القرارات</summary><div className="mt-3 space-y-4">
      <p><Link href="/staff/council/decisions" className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold text-primary active:bg-muted">سجل القرارات كاملًا ←</Link></p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا جلسات مسجّلة بعد.</p> : (
        <ul className="divide-y rounded-xl border bg-background">
          {rows.map((r) => <li key={r.id}><Link href={`/staff/council/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted"><b>{r.title}</b>{r.session_no && <span className="text-xs text-muted-foreground">({r.session_no})</span>}<span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary">{SESSION_STATUS[r.status]}</span>{r.is_demo && <span className="rounded bg-muted px-2 text-xs">تجريبي</span>}<span className="ms-auto text-sm text-muted-foreground">{fmt(r.held_on)}</span></Link></li>)}
        </ul>
      )}
      </div></details>
      <details className="elev rounded-2xl border bg-background p-4"><summary className="min-h-11 cursor-pointer py-2 font-bold text-primary">+ جلسة جديدة</summary>
      <form action={createSession} className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-sm font-medium sm:col-span-2">عنوان الجلسة<input name="title" required maxLength={200} placeholder="مثال: الجلسة الاعتيادية الشهرية" className={field} /></label>
        <label className="space-y-1 text-sm font-medium">التاريخ<input type="date" name="held_on" required className={field} /></label>
        <label className="space-y-1 text-sm font-medium">رقم الجلسة<input name="no" maxLength={40} className={field} /></label>
        <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 sm:col-span-4">إنشاء جلسة</button>
      </form>
      </details>
    </main></>
  );
}
