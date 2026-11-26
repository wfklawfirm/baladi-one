import { COMMITTEE_KIND, COMMITTEE_RESULT } from "@/lib/procurement";
import { membersWithoutDeclaration } from "@/lib/procurementObjections";
import { addItemCommittee, addItemCommitteeMember, setItemCommitteeReport } from "@/app/staff/procurement/actions";
import { btn, fld } from "@/components/projects/procurement/data";
import type { Committee, Member } from "@/components/projects/procurement/CommitteeSection";

/** Committees attached to a plan item (bids page). Same tables/RPCs as the contract-file CommitteeSection; the contract flow is untouched. */
export default function ObjectionsCommitteePanel({ itemId, committees, members, decisions }: { itemId: string; committees: Committee[]; members: Member[]; decisions: { id: string; label: string }[] }) {
  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <h2 className="font-bold text-primary">لجان هذا الإجراء</h2>
      {committees.length === 0 && <p className="text-sm text-muted-foreground">لا لجان مسجَّلة لهذا الإجراء.</p>}
      {committees.map((c) => {
        const ms = members.filter((m) => m.committee_id === c.id), missing = membersWithoutDeclaration(ms);
        return (
          <div key={c.id} className="space-y-2 rounded-xl border p-3 text-sm">
            <p className="font-bold">{COMMITTEE_KIND[c.kind]} <span className="font-normal text-muted-foreground">· {COMMITTEE_RESULT[c.result]}{c.result_on ? ` ${c.result_on}` : ""}</span></p>
            <p className="text-muted-foreground">قرار التشكيل: {c.formation_decision_id ? (decisions.find((d) => d.id === c.formation_decision_id)?.label ?? "مربوط") : "غير مربوط"}{c.formed_on ? ` · ${c.formed_on}` : ""}</p>
            {missing.length > 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">تنبيه (للعلم فقط): {missing.length} من أعضاء اللجنة بلا إقرار بتضارب المصالح مسجَّل. لا يمنع النظام أي إجراء.</p>}
            <ul className="space-y-1">{ms.length === 0 ? <li className="text-muted-foreground">لا أعضاء مسجَّلون.</li> : ms.map((m) => (
              <li key={m.id}>{m.name}{m.role_ar ? ` (${m.role_ar})` : ""} — {m.has_conflict === null ? <span className="font-semibold text-destructive">لا إقرار بعدم تضارب المصالح</span> : m.has_conflict ? <span className="font-semibold text-destructive">أقرّ بوجود تضارب: {m.declaration_note ?? "—"}</span> : <>إقرار بعدم التضارب {m.declaration_on ?? ""}</>}</li>))}</ul>
            <details><summary className="cursor-pointer font-bold text-primary">إضافة عضو وإقراره</summary>
              <form action={addItemCommitteeMember} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={itemId} /><input type="hidden" name="committee" value={c.id} />
                <label className="text-sm">الاسم<input name="name" required maxLength={200} className={`${fld} block`} /></label>
                <label className="text-sm">الصفة<input name="role" maxLength={100} className={`${fld} block`} /></label>
                <label className="text-sm">تضارب المصالح<select name="conflict" defaultValue="" className={`${fld} block`}><option value="">لم يُقدَّم إقرار</option><option value="no">إقرار بعدم التضارب</option><option value="yes">إقرار بوجود تضارب</option></select></label>
                <label className="text-sm">تاريخ الإقرار<input type="date" name="declared" className={`${fld} block`} /></label>
                <label className="text-sm">ملاحظة<input name="note" maxLength={1000} className={`${fld} block`} /></label><button className={btn}>إضافة</button></form></details>
            <details><summary className="cursor-pointer font-bold text-primary">المحضر/التقرير والنتيجة</summary>
              <form action={setItemCommitteeReport} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="item" value={itemId} /><input type="hidden" name="committee" value={c.id} />
                <label className="text-sm sm:col-span-3">نص المحضر / التقرير<textarea name="report" rows={4} maxLength={20000} defaultValue={c.report_text ?? ""} className="w-full rounded-xl border-2 bg-background p-2" /></label>
                <label className="text-sm">تاريخ المحضر<input type="date" name="report_on" defaultValue={c.report_on ?? ""} className={`${fld} block w-full`} /></label>
                <label className="text-sm">النتيجة<select name="result" defaultValue={c.result} className={`${fld} block w-full`}>{Object.entries(COMMITTEE_RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-sm">تاريخ النتيجة<input type="date" name="result_on" defaultValue={c.result_on ?? ""} className={`${fld} block w-full`} /></label>
                <button className={`${btn} sm:col-span-3`}>حفظ المحضر</button></form></details>
          </div>);
      })}
      <details><summary className="cursor-pointer font-bold text-primary">تشكيل لجنة جديدة</summary>
        <form action={addItemCommittee} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={itemId} />
          <label className="text-sm">النوع<select name="kind" className={`${fld} block`}>{Object.entries(COMMITTEE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm">قرار التشكيل<select name="decision" className={`${fld} block max-w-60`}><option value="">غير مربوط</option>{decisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          <label className="text-sm">تاريخ التشكيل<input type="date" name="formed" className={`${fld} block`} /></label>
          <label className="text-sm">ملاحظات<input name="notes" maxLength={2000} className={`${fld} block`} /></label><button className={btn}>إنشاء</button></form></details>
    </section>
  );
}
