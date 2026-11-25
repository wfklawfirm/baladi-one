import { STAGE_LABEL, STAGES, type StageState } from "@/lib/procurement";
import { setStageEvidence } from "@/app/staff/projects/procurement/actions";
import { btn, fld } from "./data";

/** The 16-stage procurement file: ✔ with evidence, or «ناقص». Manual evidence can be recorded for any stage that is not derived from existing data. */
export default function FileStages({ contractId, stages }: { contractId: string; stages: StageState[] }) {
  const done = stages.filter((s) => s.done).length;
  return (
    <section className="elev space-y-3 rounded-2xl border bg-background p-4">
      <h2 className="font-bold text-primary">ملف الشراء — المراحل ({done}/{stages.length})</h2>
      <ol className="space-y-1.5 text-sm">{stages.map((s) => (
        <li key={s.stage} className="flex flex-wrap items-baseline gap-2 border-b py-1.5 last:border-0">
          <span aria-hidden className={s.done ? "font-bold text-green-700" : "font-bold text-destructive"}>{s.done ? "✔" : "✖"}</span>
          <b>{s.label}</b>
          <span className="text-sm text-muted-foreground">{s.done ? `${s.evidence}${s.source === "manual" ? " (إثبات يدوي)" : ""}` : "ناقص: لا إثبات مسجَّل"}</span>
        </li>))}</ol>
      <details><summary className="cursor-pointer text-sm font-bold text-primary">تسجيل إثبات لمرحلة</summary>
        <form action={setStageEvidence} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="contract" value={contractId} />
          <label className="text-sm">المرحلة<select name="stage" className={`${fld} block`}>{STAGES.map((k) => <option key={k} value={k}>{STAGE_LABEL[k]}</option>)}</select></label>
          <label className="text-sm">الإثبات (اسم مستند/رقم/رابط)<input name="evidence" required maxLength={1000} className={`${fld} block`} /></label>
          <label className="text-sm">التاريخ<input type="date" name="on" className={`${fld} block`} /></label>
          <label className="text-sm">ملاحظة<input name="note" maxLength={1000} className={`${fld} block`} /></label>
          <button className={btn}>حفظ</button></form></details>
      <p className="text-sm text-muted-foreground">ملء المرحلة هنا يعني وجود إثبات مسجَّل فقط؛ لا يُقيّم النظام صحة الإجراء قانونيًا.</p>
    </section>
  );
}
