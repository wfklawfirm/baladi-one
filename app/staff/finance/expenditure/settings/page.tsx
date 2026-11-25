import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { curName, money } from "@/lib/finance";
import { EXP_FNS, FN_LABEL, newKey, reviewLabel } from "@/lib/expenditure";
import { Panel } from "@/components/finance/Parts";
import { btn, btnSm, ExpFlash, ExpNav, field, Flag, lbl, MoneyFields, NotActive } from "@/components/finance/expenditure/Parts";
import { Intro } from "@/components/simple/kit";
import { loadExp, nameOf } from "../data";
import { assign, declareException, declareSodException, orderExceptional, setEnforcement, unassign } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الوظائف والاستثناءات — دورة الإنفاق", referrer: "no-referrer" as const };

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const d = await loadExp(sb);
  const shell = (body: React.ReactNode) => <><StaffHeader back="/staff/finance/expenditure" backLabel="دورة الإنفاق" /><main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><ExpNav current="settings" /><Intro title="من يقوم بكل مهمة في الإنفاق؟">هنا تحدّدون الموظف المسؤول عن كل خطوة (حجز المبلغ، التحقق من الاستلام، أمر الصرف، الدفع). الأصل أن لا يقوم شخص واحد بكل الخطوات، حمايةً للمال العام. الأقسام الأخيرة للحالات الاستثنائية فقط.</Intro><h1 hidden className="text-2xl font-bold">الوظائف المالية والاستثناءات</h1>{body}</main></>;
  if (d.state !== "ok") return shell(<NotActive detail={d.detail} />);

  const back = <input type="hidden" name="back" value="/staff/finance/expenditure/settings" />;
  const active = d.assignments.filter((a) => a.active);
  const lineOf = (id: string) => d.lines.find((l) => l.id === id);
  const spent = (eid: string) => d.orders.filter((o) => o.exception_id === eid).reduce((s, o) => s + Number(o.amount), 0);
  const commitOpt = d.commits.filter((c) => c.entry_kind === "commitment");
  const lineOpt = d.lines.filter((l) => l.fiscal_year?.status === "open").map((l) => <option key={l.id} value={l.id}>{l.code} · {l.title_ar} ({l.currency})</option>);
  const userOpt = d.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name || p.user_id.slice(0, 8)} ({p.role})</option>);
  const Ref = ({ s }: { s: string }) => { const r = reviewLabel(s); return <Flag tone={r.verified ? "ok" : "warn"}>{r.text}</Flag>; };

  return shell(<>
    <ExpFlash ok={sp.ok} err={sp.err} />
    <Panel title="هل نُلزم الجميع بالخطوات؟" sub="عند التفعيل يمنع النظام الالتزام والدفع المباشرين القديمين، فلا يمرّ إنفاق إلا عبر المراحل الإلزامية. يُسجَّل القرار وسببه في سجل التدقيق.">
      <p className="mb-2 text-sm">الحالة الحالية: {d.enforce ? <Flag tone="ok">✓ مفعّل</Flag> : <Flag>! غير مفعّل</Flag>}</p>
      <form action={setEnforcement} className="grid gap-3 sm:grid-cols-3">{back}
        <label className={lbl}>ماذا تريدون؟<select name="on" className={field}><option value="1">إلزام الجميع بالخطوات (موصى به)</option><option value="0">السماح بالدفع المباشر القديم</option></select></label>
        <label className={`${lbl} sm:col-span-2`}>سبب هذا القرار (إلزامي)<input name="reason" required maxLength={500} className={field} /></label>
        <button className={`${btn} sm:col-span-3`}>احفظ القرار</button></form>
    </Panel>

    <Panel title="من يقوم بأي مهمة؟" sub="من يحق له: عقد النفقة، التصفية، أمر الصرف، الدفع، المطابقة. لا يجوز لمستخدم واحد تنفيذ مرحلتين متتاليتين في الدورة نفسها إلا باستثناء موثَّق. لا يُفترض هنا نظام محاسبي ولا سقف مالي؛ مرجع التكليف يُدخله المسؤول ويبقى «بانتظار المراجعة القانونية».">
      {active.length === 0 ? <p className="mb-3 text-sm text-destructive">لم تُسند أي مهمة بعد، فلا أحد يستطيع تنفيذ الخطوات. أسندوا المهام من النموذج أدناه.</p> : (
        <div className="mb-3 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b text-start"><th className="p-2 text-start">الموظف</th>{EXP_FNS.map((f) => <th key={f} className="p-2 text-start">{FN_LABEL[f]}</th>)}</tr></thead>
          <tbody>{[...new Set(active.map((a) => a.user_id))].map((u) => <tr key={u} className="border-b"><td className="p-2 font-semibold">{nameOf(d.people, u)}</td>{EXP_FNS.map((f) => { const a = active.find((x) => x.user_id === u && x.fn === f); return <td key={f} className="p-2">{a ? <form action={unassign} className="flex items-center gap-1">{back}<input type="hidden" name="assignment" value={a.id} /><span aria-label="مسندة">✔</span><button className={btnSm}>سحب</button></form> : "—"}</td>; })}</tr>)}</tbody></table></div>)}
      <form action={assign} className="grid gap-3 sm:grid-cols-4">{back}
        <label className={lbl}>الموظف<select name="user" required className={field}>{userOpt}</select></label>
        <label className={lbl}>المهمة<select name="fn" className={field}>{EXP_FNS.map((f) => <option key={f} value={f}>{FN_LABEL[f]}</option>)}</select></label>
        <label className={`${lbl} sm:col-span-2`}>رقم قرار التكليف (اختياري)<input name="basis" maxLength={300} className={field} /></label>
        <button className={`${btn} sm:col-span-4`}>أسند المهمة</button></form>
    </Panel>

    <Panel title="حالة استثنائية: صرف بدون المرور بكل الخطوات (للمختصين)" sub="مبرر قانوني + مرجع إلزاميان + سقف مبلغ معتمد. الأوامر الصادرة به تظهر موسومة «مسار استثنائي». المراجع غير المتحقَّق منها تُعرض «بانتظار المراجعة القانونية». لم يُدخل النظام أي مادة قانونية؛ المسؤول يدخل المرجع.">
      <form action={declareException} className="grid gap-3 sm:grid-cols-2">{back}
        <label className={lbl}>النوع<select name="scope" className={field}><option value="skip_liquidation">أمر صرف على التزام دون تصفية</option><option value="direct_payment">صرف مباشر دون التزام ولا تصفية</option></select></label>
        <label className={lbl}>بند الموازنة<select name="line" required className={field}>{lineOpt}</select></label>
        <label className={lbl}>الالتزام (للنوع الأول فقط)<select name="commitment" className={field}><option value="">—</option>{commitOpt.map((c) => <option key={c.id} value={c.id}>{c.commitment_no ?? c.id.slice(0, 8)} — {c.description}</option>)}</select></label>
        <label className={lbl}>السقف المعتمد (بعملة البند)<input name="amount" inputMode="decimal" required className={field} /></label>
        <label className={`${lbl} sm:col-span-2`}>المبرر القانوني (نص)<textarea name="justification" required minLength={10} maxLength={3000} rows={3} className={`${field} py-2`} /></label>
        <label className={`${lbl} sm:col-span-2`}>المرجع المطلوب (رقم نص/قرار/كتاب)<input name="reference" required maxLength={500} className={field} /></label>
        <button className={`${btn} sm:col-span-2`}>سجّل الاستثناء</button></form>
      {d.exceptions.length > 0 && <ul className="mt-4 space-y-3">{d.exceptions.map((e) => { const l = lineOf(e.line_id), cur = l?.currency ?? "LBP", left = Number(e.approved_amount) - spent(e.id); return (
        <li key={e.id} className="rounded-xl border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><Flag>مسار استثنائي</Flag><b>{e.scope === "skip_liquidation" ? "دون تصفية" : "صرف مباشر"}</b><span>{l ? `${l.code} (${curName(cur)})` : ""}</span><span>السقف {money(Number(e.approved_amount), cur)} · المتبقي {money(left, cur)}</span></div>
          <p className="mt-1">{e.legal_justification}</p><p className="mt-1 text-xs">المرجع: {e.legal_reference} <Ref s={e.reference_review} /></p>
          {left > 0 && <details className="mt-2"><summary className={`${btnSm} inline-flex cursor-pointer list-none items-center`}>إصدار أمر صرف بهذا الاستثناء</summary>
            <form action={orderExceptional} className="mt-2 grid gap-3">{back}<input type="hidden" name="exception" value={e.id} /><input type="hidden" name="key" value={newKey()} /><MoneyFields />
              <label className={lbl}>المستفيد<input name="beneficiary" required maxLength={200} className={field} /></label><label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label><button className={btn}>إصدار الأمر (موسوم كاستثناء)</button></form></details>}</li>); })}</ul>}
    </Panel>

    <Panel title="حالة استثنائية: السماح لموظف بتنفيذ خطوتين متتاليتين (للمختصين)" sub="يسمح لموظف محدد بتنفيذ مرحلتين متتاليتين (على التزام محدد أو على البند كله) بمبرر ومرجع موثَّقين. يُسجَّل معرّف الاستثناء على كل قيد استُخدم فيه.">
      <form action={declareSodException} className="grid gap-3 sm:grid-cols-2">{back}
        <label className={lbl}>الموظف<select name="user" required className={field}>{userOpt}</select></label>
        <label className={lbl}>بند الموازنة<select name="line" required className={field}>{lineOpt}</select></label>
        <label className={`${lbl} sm:col-span-2`}>الالتزام (اتركه فارغًا ليشمل البند كله)<select name="commitment" className={field}><option value="">كل التزامات البند</option>{commitOpt.map((c) => <option key={c.id} value={c.id}>{c.commitment_no ?? c.id.slice(0, 8)} — {c.description}</option>)}</select></label>
        <label className={`${lbl} sm:col-span-2`}>المبرر<textarea name="justification" required minLength={10} maxLength={3000} rows={2} className={`${field} py-2`} /></label>
        <label className={`${lbl} sm:col-span-2`}>المرجع<input name="reference" required maxLength={500} className={field} /></label>
        <button className={`${btn} sm:col-span-2`}>سجّل الاستثناء</button></form>
      {d.sods.length > 0 && <ul className="mt-3 divide-y text-sm">{d.sods.map((s) => <li key={s.id} className="py-2">{nameOf(d.people, s.user_id)} — {lineOf(s.line_id)?.code ?? ""} — {s.justification} · المرجع: {s.legal_reference} <Ref s={s.reference_review} /></li>)}</ul>}
    </Panel>
  </>);
}
