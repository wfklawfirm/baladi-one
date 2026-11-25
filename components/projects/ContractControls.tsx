import { amendContract, setContractDates, setContractStatus } from "@/app/staff/projects/actions";
import { METHOD, earliestSigning } from "@/lib/council";
import { CONTRACT_STATUS } from "@/lib/projects";
const f = "min-h-10 rounded-xl border-2 bg-background px-2";
const b = "min-h-10 rounded-xl border px-4 text-sm font-semibold active:bg-muted";
export type CC = { id: string; status: string; procurement_method: string | null; published_on: string | null; award_notice_on: string | null; ppa_notice_on: string | null; signed_on: string | null; decision_id: string | null; justification: string | null };

export default function ContractControls({ c, back, decisions }: { c: CC; back?: string; decisions: { id: string; label: string }[] }) {
  const hid = <><input type="hidden" name="id" value={c.id} />{back && <input type="hidden" name="back" value={back} />}</>;
  const earliest = earliestSigning(c);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">أسلوب التلزيم: <b>{c.procurement_method ? METHOD[c.procurement_method] ?? c.procurement_method : "غير محدد"}</b>{c.published_on ? ` · نُشر ${c.published_on}` : ""}{c.award_notice_on ? ` · إشعار الترسية ${c.award_notice_on}` : ""}{c.signed_on ? ` · وُقّع ${c.signed_on}` : ""}{earliest && c.status === "draft" ? ` · أبكر توقيع مقبول ${earliest}` : ""}</p>
      {c.status === "draft" && !c.decision_id && c.procurement_method && !["quotations", "invoice"].includes(c.procurement_method) && <p className="text-xs font-semibold text-destructive">⚠ غير مربوط بقرار من المجلس البلدي.</p>}
      <form action={setContractStatus} className="grid grid-cols-[1fr_auto] items-end gap-2">{hid}
        <select name="value" defaultValue={c.status} aria-label="حالة العقد" className={`${f} w-full`}>{Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className={b}>تحديث</button>
        {c.status === "draft" && <label className="col-span-2 text-xs sm:col-span-1">تاريخ التوقيع (عند اختيار «موقَّع»)<input type="date" name="signed" className={`${f} block w-full`} /></label>}
        <input name="note" maxLength={500} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className={`${f} col-span-2 min-w-0 sm:col-span-1`} /></form>
      {c.status === "draft" && <details><summary className="cursor-pointer text-xs font-bold text-primary">تواريخ الإجراءات (النشر، الترسية، إبلاغ هيئة الشراء)</summary>
        <form action={setContractDates} className="mt-2 flex flex-wrap items-end gap-2">{hid}
          <label className="text-xs">نشر الإعلان<input type="date" name="published" defaultValue={c.published_on ?? ""} className={`${f} block`} /></label>
          <label className="text-xs">إشعار الترسية<input type="date" name="award" defaultValue={c.award_notice_on ?? ""} className={`${f} block`} /></label>
          <label className="text-xs">إبلاغ هيئة الشراء (رضائي)<input type="date" name="ppa" defaultValue={c.ppa_notice_on ?? ""} className={`${f} block`} /></label>
          <button className={b}>حفظ التواريخ</button></form></details>}
      {c.status !== "draft" && <details><summary className="cursor-pointer text-xs font-bold text-primary">ملحق / تعديل قيمة العقد</summary>
        <form action={amendContract} className="mt-2 flex flex-wrap items-end gap-2">{hid}
          <label className="text-xs">التغيير (سالب للنقصان)<input name="delta" required inputMode="decimal" className={`${f} block`} /></label>
          <label className="text-xs">السبب<input name="reason" required maxLength={500} className={`${f} block`} /></label>
          <label className="text-xs">قرار المجلس<select name="decision" className={`${f} block`}><option value="">غير مربوط</option>{decisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          <button className={b}>تسجيل التعديل</button></form>
        <p className="mt-1 text-[11px] text-muted-foreground">زيادة قيمة العقد بملحق مقيّدة قانونًا بنسبة وشروط؛ ربط القرار والتحقق مسؤولية المختص.</p></details>}
    </div>
  );
}
