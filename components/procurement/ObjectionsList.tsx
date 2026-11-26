import { OBJECTION_STATUS, isClosedObjection } from "@/lib/procurementObjections";
import { addObjectionReply, decideObjection, withdrawObjection } from "@/app/staff/procurement/actions";
import { btn, fld } from "@/components/projects/procurement/data";

export type Objection = { id: string; objector: string; subject: string; received_on: string; competent_authority: string | null; deadline_note: string | null; documents_ref: string | null; decision: string | null; decided_on: string | null; effect_on_procedure: string | null; status: string };
export type ObjectionReply = { id: string; objection_id: string; reply_text: string; replied_on: string };

export default function ObjectionsList({ itemId, rows, replies, today }: { itemId: string; rows: Objection[]; replies: ObjectionReply[]; today: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">لا اعتراضات مسجَّلة لهذا الإجراء.</p>;
  return (<div className="space-y-3">{rows.map((o) => {
    const rs = replies.filter((r) => r.objection_id === o.id), closed = isClosedObjection(o.status);
    return (
      <article key={o.id} className="space-y-2 rounded-xl border p-3 text-sm">
        <p className="font-bold">{o.objector} <span className="font-normal text-muted-foreground">· {OBJECTION_STATUS[o.status] ?? o.status} · استُلم {o.received_on}</span></p>
        <p className="whitespace-pre-wrap">{o.subject}</p>
        <p className="text-muted-foreground">الجهة المختصة (كما أُدخلت): {o.competent_authority ?? "غير مسجَّلة"} · ملاحظة المهلة (كما أُدخلت، لا يحتسبها النظام): {o.deadline_note ?? "غير مسجَّلة"} · المستندات: {o.documents_ref ?? "—"}</p>
        {rs.length > 0 && <ul className="space-y-1">{rs.map((r) => <li key={r.id} className="rounded-lg bg-muted/40 p-2">رد {r.replied_on}: <span className="whitespace-pre-wrap">{r.reply_text}</span></li>)}</ul>}
        {o.status === "decided" && <p className="rounded-lg border p-2">القرار ({o.decided_on}): <span className="whitespace-pre-wrap">{o.decision}</span><br />الأثر على الإجراء (يُتحقق منه قانونيًا): {o.effect_on_procedure ?? "غير مسجَّل"}</p>}
        {!closed && <>
          <details><summary className="cursor-pointer font-bold text-primary">إضافة رد</summary>
            <form action={addObjectionReply} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="item" value={itemId} /><input type="hidden" name="objection" value={o.id} />
              <label className="text-sm sm:col-span-2">نص الرد<textarea name="reply" required rows={3} maxLength={5000} className="w-full rounded-xl border-2 bg-background p-2" /></label>
              <label className="text-sm">تاريخ الرد<input type="date" name="replied" required defaultValue={today} className={`${fld} block w-full`} /></label>
              <button className={`${btn} sm:col-span-3`}>حفظ الرد</button></form></details>
          <details><summary className="cursor-pointer font-bold text-primary">تسجيل القرار</summary>
            <p className="mt-1 text-xs text-muted-foreground">يسجّل المستخدم قرار الجهة المختصة كما صدر؛ لا يتخذه النظام ولا الذكاء الاصطناعي.</p>
            <form action={decideObjection} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="item" value={itemId} /><input type="hidden" name="objection" value={o.id} />
              <label className="text-sm sm:col-span-2">نص القرار<textarea name="decision" required rows={3} maxLength={5000} className="w-full rounded-xl border-2 bg-background p-2" /></label>
              <label className="text-sm">تاريخ القرار<input type="date" name="decided" required defaultValue={today} className={`${fld} block w-full`} /></label>
              <label className="text-sm sm:col-span-3">الأثر على الإجراء (نص حر، بعد التحقق القانوني)<input name="effect" maxLength={2000} className={`${fld} block w-full`} /></label>
              <button className={`${btn} sm:col-span-3`}>حفظ القرار</button></form></details>
          <form action={withdrawObjection}><input type="hidden" name="item" value={itemId} /><input type="hidden" name="objection" value={o.id} /><button className={btn}>تسجيل سحب الاعتراض</button></form></>}
      </article>);
  })}</div>);
}
