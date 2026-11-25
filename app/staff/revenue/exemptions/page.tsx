import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Intro } from "@/components/simple/kit";
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
      <Intro title="الإعفاءات">الإعفاء يوقف تكليف مكلّف برسم معيّن لفترة محددة. لا يُسجَّل إعفاء بلا مستند أو قرار يثبته.</Intro>
      <RevenueNav current="exemptions" />
      <Flash ok={sp.ok} err={sp.err} />
      {d.error ? <Pending missing={d.missing} /> : <>
        <p className="text-xs text-muted-foreground">لا إعفاء بلا مستند (قرار بلدي أو مرجع مستند). الإعفاء المعتمد يمنع التكليف لنفس المكلّف والرسم والفترة. الأساس القانوني للإعفاء يُدخله الموظف وهو <b>{NEEDS_LEGAL}</b> قبل الاعتماد.</p>
        {admin && <Panel fold title="تسجيل طلب إعفاء">
          <form action={addExemption} className="grid gap-3 sm:grid-cols-2">{back}
            <label className="block space-y-1 text-base font-semibold">المكلّف<span className="block text-sm font-normal leading-6 text-muted-foreground">اختاروا المكلّف من القائمة.</span><select name="taxpayer" required className={field}>{d.taxpayers.map((t) => <option key={t.id} value={t.id}>{t.taxpayer_ref}{t.name_ar ? ` — ${t.name_ar}` : ""}</option>)}</select></label>
<label className="block space-y-1 text-base font-semibold">نوع الرسم<span className="block text-sm font-normal leading-6 text-muted-foreground">نوع الرسم أو الضريبة كما يرد في القرار.</span><input name="fee_type" required maxLength={200} className={field} /><span className="block text-xs font-normal text-muted-foreground">مثال: رسم إشغال الأملاك</span></label>
<label className="block space-y-1 text-base font-semibold sm:col-span-2">سبب الإعفاء<span className="block text-sm font-normal leading-6 text-muted-foreground">اشرحوا السبب بجملة واضحة.</span><input name="reason" required minLength={5} maxLength={1000} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">القرار البلدي<span className="block text-sm font-normal leading-6 text-muted-foreground">اربطوا الأمر بقرار البلدية الذي أقرّه إن وُجد.</span><select name="decision" className={field}><option value="">— بلا —</option>{d.decisions.map((x) => <option key={x.id} value={x.id}>{x.decision_no}/{x.year} — {x.title.slice(0, 60)}</option>)}</select></label>
<label className="block space-y-1 text-base font-semibold">من<span className="block text-sm font-normal leading-6 text-muted-foreground">أول يوم يسري فيه.</span><input name="from" type="date" required className={field} /></label>
<details className="rounded-2xl border p-3 sm:col-span-2"><summary className="cursor-pointer text-base font-semibold">حقول إضافية (اختيارية)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-base font-semibold">الصك القانوني (كما يرد في المستند)<span className="block text-sm font-normal leading-6 text-muted-foreground">اسم النص القانوني كما هو مكتوب في المصدر.</span><input name="instrument" maxLength={200} className={field} /><span className="block text-xs font-normal text-muted-foreground">مثال: قانون / مرسوم / قرار</span></label>
<label className="block space-y-1 text-base font-semibold">المادة<span className="block text-sm font-normal leading-6 text-muted-foreground">رقم المادة كما في المصدر.</span><input name="article" maxLength={60} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">مرجع المستند (إن لم يوجد قرار)<span className="block text-sm font-normal leading-6 text-muted-foreground">رقم المستند الذي يثبت الإعفاء.</span><input name="document_ref" maxLength={200} className={field} /></label>
<label className="block space-y-1 text-base font-semibold">إلى (اختياري)<span className="block text-sm font-normal leading-6 text-muted-foreground">آخر يوم يسري فيه، أو اتركه فارغًا.</span><input name="to" type="date" className={field} /></label></div></details>
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
