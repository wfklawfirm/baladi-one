import { supabaseServer } from "@/lib/supabase-server";
import { amendContract, setContractDates, setContractStatus, setObjection } from "@/app/staff/projects/actions";
import { METHOD, earliestSigning } from "@/lib/council";
import { CONTRACT_STATUS } from "@/lib/projects";
import Link from "next/link";
import CompletionForm, { acceptanceState } from "@/components/projects/procurement/CompletionForm";
import { LateBadge, LateLinkForm, readLate } from "@/components/projects/procurement/LateLink";
const f = "min-h-12 rounded-xl border-2 bg-background px-2";
const b = "min-h-12 rounded-xl border px-4 text-sm font-semibold active:bg-muted";
export type CC = { id: string; status: string; procurement_method: string | null; published_on: string | null; award_notice_on: string | null; ppa_notice_on: string | null; signed_on: string | null; decision_id: string | null; justification: string | null; objection_pending?: boolean; objection_resolved_on?: string | null };

export default async function ContractControls({ c, back, decisions }: { c: CC; back?: string; decisions: { id: string; label: string }[] }) {
  const hid = <><input type="hidden" name="id" value={c.id} />{back && <input type="hidden" name="back" value={back} />}</>;
  const sb = await supabaseServer();
  const { data: hol } = await sb.from("legal_holiday").select("day");
  const acc = c.status === "signed" || c.status === "active" ? await acceptanceState(c.id) : null;
  const late = await readLate(c.id);
  const statusOpts = Object.entries(CONTRACT_STATUS).filter(([k]) => !(k === "completed" && acc !== null && c.status !== "completed"));
  const earliest = earliestSigning(c, (hol ?? []).map((h: { day: string }) => h.day));
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">أسلوب التلزيم: <b>{c.procurement_method ? METHOD[c.procurement_method] ?? c.procurement_method : "غير محدد"}</b>{c.published_on ? ` · نُشر ${c.published_on}` : ""}{c.award_notice_on ? ` · نشر قبول العرض ${c.award_notice_on}` : ""}{c.signed_on ? ` · وُقّع ${c.signed_on}` : ""}{earliest && c.status === "draft" ? ` · أبكر توقيع يقبله النظام ${earliest} (لا يكفي وحده)` : ""}</p>
      {c.status === "draft" && !c.decision_id && c.procurement_method && !["quotations", "invoice"].includes(c.procurement_method) && <p className="text-sm font-semibold text-destructive">⚠ غير مربوط بقرار من المجلس البلدي — تحقّق من الاختصاص (يُراجع قانونيًا).</p>}
      <LateBadge late={late} />
      {!c.decision_id && <LateLinkForm contractId={c.id} back={back ? `/staff/projects/${back}` : undefined} decisions={decisions} />}
      <Link href={`/staff/projects/procurement/contract/${c.id}`} className="inline-block text-sm font-bold text-primary">ملف الشراء (المراحل، اللجان، النشر الرسمي) ←</Link>
      <form action={setContractStatus} className="grid grid-cols-[1fr_auto] items-end gap-2">{hid}
        <select name="value" defaultValue={c.status} aria-label="حالة العقد" className={`${f} w-full`}>{statusOpts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className={b}>حفظ حالة العقد</button>
        {c.status === "draft" && <label className="col-span-2 text-sm sm:col-span-1">تاريخ التوقيع (اكتبوه عند اختيار «موقَّع»)<input type="date" name="signed" className={`${f} block w-full`} /></label>}
        <input name="note" maxLength={500} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className={`${f} col-span-2 min-w-0 sm:col-span-1`} /></form>
      {acc !== null && <CompletionForm contractId={c.id} back={back ? `/staff/projects/${back}` : undefined} has={acc} />}
      {c.objection_pending && <p className="text-sm font-semibold text-destructive">⛔ اعتراض قائم: التوقيع ممنوع حتى البتّ فيه.</p>}
      {c.status === "draft" && <details><summary className="cursor-pointer text-sm font-bold text-primary">إذا اعترض أحد المتنافسين على النتيجة (هيئة الاعتراضات)</summary>
        <form action={setObjection} className="mt-2 flex flex-wrap items-end gap-2">{hid}
          <label className="text-sm">الحالة<select name="pending" defaultValue={c.objection_pending ? "1" : "0"} className={`${f} block`}><option value="0">لا اعتراض / تم البتّ</option><option value="1">اعتراض قائم</option></select></label>
          <label className="text-sm">تاريخ البتّ<input type="date" name="resolved" defaultValue={c.objection_resolved_on ?? ""} className={`${f} block`} /></label>
          <button className={b}>حفظ</button></form>
        <p className="mt-1 text-sm text-muted-foreground">تبتّ الهيئة خلال 20 يوم عمل؛ يمنع الاعتراض القائم التوقيع (قانون 244/2021).</p></details>}
      {c.status === "draft" && <details><summary className="cursor-pointer text-sm font-bold text-primary">تواريخ الإجراءات: النشر والترسية وإبلاغ هيئة الشراء</summary>
        <form action={setContractDates} className="mt-2 flex flex-wrap items-end gap-2">{hid}
          <label className="text-sm">نشر الإعلان<input type="date" name="published" defaultValue={c.published_on ?? ""} className={`${f} block`} /></label>
          <label className="text-sm">نشر قبول العرض الفائز<input type="date" name="award" defaultValue={c.award_notice_on ?? ""} className={`${f} block`} /></label>
          <label className="text-sm">إبلاغ هيئة الشراء (رضائي)<input type="date" name="ppa" defaultValue={c.ppa_notice_on ?? ""} className={`${f} block`} /></label>
          <button className={b}>حفظ التواريخ</button></form></details>}
      {c.status !== "draft" && <details><summary className="cursor-pointer text-sm font-bold text-primary">تعديل قيمة العقد بملحق (زيادة أو نقصان)</summary>
        <form action={amendContract} className="mt-2 flex flex-wrap items-end gap-2">{hid}
          <label className="text-sm">التغيير (سالب للنقصان)<input name="delta" required inputMode="decimal" className={`${f} block`} /></label>
          <label className="text-sm">السبب<input name="reason" required maxLength={500} className={`${f} block`} /></label>
          <label className="text-sm">قرار المجلس<select name="decision" className={`${f} block`}><option value="">غير مربوط</option>{decisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          <button className={b}>تسجيل التعديل</button></form>
        <p className="mt-1 text-sm text-muted-foreground">زيادة قيمة العقد بملحق مقيّدة قانونًا بنسبة وشروط؛ ربط القرار والتحقق مسؤولية المختص.</p></details>}
    </div>
  );
}
