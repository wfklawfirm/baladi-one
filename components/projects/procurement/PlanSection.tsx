import Link from "next/link";
import { METHOD } from "@/lib/council";
import { PLAN_STATUS } from "@/lib/procurement";
import { addPlanItem, linkPlanContract, setPlanStatus } from "@/app/staff/projects/procurement/actions";
import { btn, fld, money } from "./data";

export type PlanRow = { id: string; fiscal_year: number; title: string; need_description: string | null; estimated_value: number; currency: string; budget_line_id: string | null; funding_note: string | null; planned_method: string | null; responsible: string | null; planned_publish_on: string | null; planned_award_on: string | null; planned_start_on: string | null; status: string; contract_id: string | null };

export default function PlanSection({ rows, lines, contracts, year }: { rows: PlanRow[]; lines: { id: string; code: string; title_ar: string }[]; contracts: { id: string; contractor: string; subject: string }[]; year: number }) {
  const lineName = (id: string | null) => { const l = lines.find((x) => x.id === id); return l ? `${l.code} — ${l.title_ar}` : null; };
  return (
    <section className="elev space-y-3 rounded-2xl border bg-background p-4">
      <h2 className="font-bold text-primary">خطة الشراء السنوية</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا بنود في الخطة بعد.</p> : (
        <ul className="space-y-2 text-sm">{rows.map((r) => (
          <li key={r.id} className="space-y-1 rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2"><b>{r.title}</b><span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-bold text-primary">{PLAN_STATUS[r.status]}</span><span className="text-sm text-muted-foreground">{r.fiscal_year}</span></div>
            {r.need_description && <p className="text-sm">{r.need_description}</p>}
            <p className="text-sm text-muted-foreground">{money(r.estimated_value, r.currency)} · الأسلوب المخطط: {r.planned_method ? METHOD[r.planned_method] : "غير محدد"} · المسؤول: {r.responsible ?? "—"}</p>
            <p className="text-sm text-muted-foreground">التمويل: {lineName(r.budget_line_id) ?? "غير مربوط ببند موازنة"}{r.funding_note ? ` — ${r.funding_note}` : ""}</p>
            <p className="text-sm text-muted-foreground">النشر {r.planned_publish_on ?? "—"} · الترسية {r.planned_award_on ?? "—"} · البدء {r.planned_start_on ?? "—"}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Link href={`/staff/procurement/bids/${r.id}`} className="min-h-12 rounded-xl border px-4 py-3 text-sm font-semibold active:bg-muted">العروض</Link>
              <form action={setPlanStatus} className="flex items-end gap-2"><input type="hidden" name="id" value={r.id} />
                <select name="value" defaultValue={r.status} aria-label="حالة البند" className={fld}>{Object.entries(PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className={btn}>تحديث</button></form>
              <form action={linkPlanContract} className="flex items-end gap-2"><input type="hidden" name="id" value={r.id} />
                <select name="contract" defaultValue={r.contract_id ?? ""} aria-label="العقد المرتبط" className={`${fld} max-w-56`}><option value="">دون عقد</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contractor} — {c.subject.slice(0, 40)}</option>)}</select><button className={btn}>ربط بعقد</button></form>
            </div>
          </li>))}</ul>)}
      <details><summary className="cursor-pointer text-sm font-bold text-primary">بند جديد في الخطة</summary>
        <form action={addPlanItem} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm sm:col-span-2">العنوان<input name="title" required maxLength={300} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">السنة<input name="year" required defaultValue={year} inputMode="numeric" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-3">الحاجة<textarea name="need" rows={2} maxLength={3000} className="w-full rounded-xl border-2 bg-background p-2" /></label>
          <label className="space-y-1 text-sm">القيمة التقديرية<input name="value" required inputMode="decimal" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">العملة<select name="currency" className={`${fld} w-full`}><option value="USD">دولار</option><option value="LBP">ليرة</option></select></label>
          <label className="space-y-1 text-sm">الأسلوب المخطط<select name="method" defaultValue="" className={`${fld} w-full`}><option value="">غير محدد</option>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-sm sm:col-span-2">بند الموازنة (الاعتماد)<select name="budget_line" defaultValue="" className={`${fld} w-full`}><option value="">غير مربوط</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.title_ar}</option>)}</select></label>
          <label className="space-y-1 text-sm">المسؤول<input name="responsible" maxLength={200} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-3">ملاحظة التمويل<input name="funding_note" maxLength={1000} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">نشر مخطط<input type="date" name="publish" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">ترسية مخططة<input type="date" name="award" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">بدء مخطط<input type="date" name="start" className={`${fld} w-full`} /></label>
          <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground sm:col-span-3">إضافة إلى الخطة</button>
        </form></details>
    </section>
  );
}
