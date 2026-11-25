import { COMMITTEE_KIND, COMMITTEE_RESULT } from "@/lib/procurement";
import { addCommittee, addCommitteeMember, setCommitteeReport } from "@/app/staff/projects/procurement/actions";
import { btn, fld } from "./data";

export type Committee = { id: string; kind: string; formation_decision_id: string | null; formed_on: string | null; notes: string | null; report_text: string | null; report_on: string | null; result: string; result_on: string | null };
export type Member = { id: string; committee_id: string; name: string; role_ar: string | null; declaration_on: string | null; has_conflict: boolean | null; declaration_note: string | null };

export default function CommitteeSection({ contractId, committees, members, decisions }: { contractId: string; committees: Committee[]; members: Member[]; decisions: { id: string; label: string }[] }) {
  const dLabel = (id: string | null) => decisions.find((d) => d.id === id)?.label;
  return (
    <section className="elev space-y-3 rounded-2xl border bg-background p-4">
      <h2 className="font-bold text-primary">لجان التلزيم والاستلام</h2>
      {committees.length === 0 && <p className="text-sm text-muted-foreground">لا لجان مسجَّلة لهذا العقد.</p>}
      {committees.map((c) => {
        const ms = members.filter((m) => m.committee_id === c.id);
        return (
          <div key={c.id} className="space-y-2 rounded-xl border p-3 text-sm">
            <p className="font-bold">{COMMITTEE_KIND[c.kind]} <span className="text-xs font-normal text-muted-foreground">· {COMMITTEE_RESULT[c.result]}{c.result_on ? ` ${c.result_on}` : ""}</span></p>
            <p className="text-xs text-muted-foreground">قرار التشكيل: {dLabel(c.formation_decision_id) ?? (c.formation_decision_id ? "مربوط" : "غير مربوط — لا قرار تشكيل مسجَّل")}{c.formed_on ? ` · ${c.formed_on}` : ""}</p>
            <ul className="space-y-1 text-xs">{ms.length === 0 ? <li className="text-muted-foreground">لا أعضاء مسجَّلون.</li> : ms.map((m) => (
              <li key={m.id}>{m.name}{m.role_ar ? ` (${m.role_ar})` : ""} — {m.has_conflict === null ? <span className="font-semibold text-destructive">لا إقرار بعدم تضارب المصالح</span> : m.has_conflict ? <span className="font-semibold text-destructive">أقرّ بوجود تضارب: {m.declaration_note ?? "—"}</span> : <>إقرار بعدم التضارب {m.declaration_on ?? ""}</>}</li>))}</ul>
            <details><summary className="cursor-pointer text-xs font-bold text-primary">إضافة عضو وإقراره</summary>
              <form action={addCommitteeMember} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="contract" value={contractId} /><input type="hidden" name="committee" value={c.id} />
                <label className="text-xs">الاسم<input name="name" required maxLength={200} className={`${fld} block`} /></label>
                <label className="text-xs">الصفة<input name="role" maxLength={100} className={`${fld} block`} /></label>
                <label className="text-xs">تضارب المصالح<select name="conflict" defaultValue="" className={`${fld} block`}><option value="">لم يُقدَّم إقرار</option><option value="no">إقرار بعدم التضارب</option><option value="yes">إقرار بوجود تضارب</option></select></label>
                <label className="text-xs">تاريخ الإقرار<input type="date" name="declared" className={`${fld} block`} /></label>
                <label className="text-xs">ملاحظة<input name="note" maxLength={1000} className={`${fld} block`} /></label><button className={btn}>إضافة</button></form></details>
            <details><summary className="cursor-pointer text-xs font-bold text-primary">المحضر/التقرير والنتيجة</summary>
              <form action={setCommitteeReport} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="contract" value={contractId} /><input type="hidden" name="committee" value={c.id} />
                <label className="text-xs sm:col-span-3">نص المحضر / التقرير<textarea name="report" rows={4} maxLength={20000} defaultValue={c.report_text ?? ""} className="w-full rounded-xl border-2 bg-background p-2" /></label>
                <label className="text-xs">تاريخ المحضر<input type="date" name="report_on" defaultValue={c.report_on ?? ""} className={`${fld} block w-full`} /></label>
                <label className="text-xs">النتيجة<select name="result" defaultValue={c.result} className={`${fld} block w-full`}>{Object.entries(COMMITTEE_RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-xs">تاريخ النتيجة<input type="date" name="result_on" defaultValue={c.result_on ?? ""} className={`${fld} block w-full`} /></label>
                <button className={`${btn} sm:col-span-3`}>حفظ المحضر</button></form></details>
          </div>);
      })}
      <details><summary className="cursor-pointer text-sm font-bold text-primary">تشكيل لجنة جديدة</summary>
        <form action={addCommittee} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="contract" value={contractId} />
          <label className="text-xs">النوع<select name="kind" className={`${fld} block`}>{Object.entries(COMMITTEE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs">قرار التشكيل<select name="decision" className={`${fld} block max-w-60`}><option value="">غير مربوط</option>{decisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          <label className="text-xs">تاريخ التشكيل<input type="date" name="formed" className={`${fld} block`} /></label>
          <label className="text-xs">ملاحظات<input name="notes" maxLength={2000} className={`${fld} block`} /></label><button className={btn}>إنشاء</button></form></details>
    </section>
  );
}
