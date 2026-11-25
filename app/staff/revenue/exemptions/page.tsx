import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { loadRevenue } from "@/lib/revenueData";
import { EXEMPT_STATUS, NEEDS_LEGAL } from "@/lib/revenue";
import { btn, btnSm, field, Flash, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";
import { addExemption, reviewExemption } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعفاءات — BALADI ONE", referrer: "no-referrer" as const };

export default async function Exemptions({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  const admin = memberships.some((m) => m.role === "mayor" || m.role === "admin");
  const sp = await searchParams;
  const d = await loadRevenue(sb);
  const back = <input type="hidden" name="back" value="/staff/revenue/exemptions" />;
  return (
    <><StaffHeader back="/staff/revenue" backLabel="الإيرادات" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <h1 className="text-2xl font-bold">الإعفاءات الموثَّقة</h1>
      <RevenueNav current="exemptions" />
      <Flash ok={sp.ok} err={sp.err} />
      {d.error ? <Pending missing={d.missing} /> : <>
        <p className="text-xs text-muted-foreground">لا إعفاء بلا مستند (قرار بلدي أو مرجع مستند). الإعفاء المعتمد يمنع التكليف لنفس المكلّف والرسم والفترة. الأساس القانوني للإعفاء يُدخله الموظف وهو <b>{NEEDS_LEGAL}</b> قبل الاعتماد.</p>
        {admin && <Panel fold title="طلب إعفاء">
          <form action={addExemption} className="grid gap-3 sm:grid-cols-2">{back}
            <label className="space-y-1 text-sm font-medium">المكلّف<select name="taxpayer" required className={field}>{d.taxpayers.map((t) => <option key={t.id} value={t.id}>{t.taxpayer_ref}{t.name_ar ? ` — ${t.name_ar}` : ""}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium">نوع الرسم<input name="fee_type" required maxLength={200} className={field} /></label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">سبب الإعفاء<input name="reason" required minLength={5} maxLength={1000} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">الصك القانوني (كما يرد في المستند)<input name="instrument" maxLength={200} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">المادة<input name="article" maxLength={60} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">القرار البلدي<select name="decision" className={field}><option value="">— بلا —</option>{d.decisions.map((x) => <option key={x.id} value={x.id}>{x.decision_no}/{x.year} — {x.title.slice(0, 60)}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium">مرجع المستند (إن لم يوجد قرار)<input name="document_ref" maxLength={200} className={field} /></label>
            <label className="space-y-1 text-sm font-medium">من<input name="from" type="date" required className={field} /></label>
            <label className="space-y-1 text-sm font-medium">إلى (اختياري)<input name="to" type="date" className={field} /></label>
            <button className={`${btn} sm:col-span-2`}>تسجيل</button>
          </form></Panel>}
        <Panel title={`الإعفاءات (${d.exemptions.length})`}>
          {d.exemptions.length === 0 ? <p className="text-sm text-muted-foreground">لا إعفاءات مسجَّلة.</p> : <ul className="space-y-3">{d.exemptions.map((e) => { const t = d.taxpayers.find((x) => x.id === e.taxpayer_id); return (
            <li key={e.id} className="rounded-xl border p-3 text-sm"><div className="flex flex-wrap gap-2"><b>{e.fee_type}</b><span dir="ltr" className="font-mono text-xs">{t?.taxpayer_ref}</span><span className="rounded-full border px-2 text-xs">{EXEMPT_STATUS[e.status] ?? e.status}</span><span className="text-xs text-muted-foreground">{e.valid_from} ← {e.valid_to ?? "مفتوح"}</span></div>
              <p className="mt-1">{e.reason_ar}</p><p className="text-xs text-muted-foreground">{e.instrument ?? "—"}{e.article ? ` م.${e.article}` : ""} · {e.decision_id ? "مرتبط بقرار" : e.document_ref}</p>
              {admin && (e.status === "pending_review" || e.status === "approved") && <form action={reviewExemption} className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">{back}<input type="hidden" name="id" value={e.id} />
                <select name="status" className={field}>{e.status === "pending_review" && <option value="approved">اعتماد</option>}{e.status === "pending_review" && <option value="rejected">رفض</option>}{e.status === "approved" && <option value="revoked">سحب</option>}</select>
                <input name="note" required minLength={5} placeholder="سبب القرار" maxLength={500} className={field} /><button className={btnSm}>تنفيذ</button></form>}
            </li>); })}</ul>}
        </Panel>
      </>}
    </main></>
  );
}
