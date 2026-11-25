import { supabaseServer } from "@/lib/supabase-server";
import { linkDecisionLate } from "@/app/staff/projects/procurement/actions";
import { btn, fld } from "./data";

type Late = { decision_linked_late: boolean; decision_linked_late_on: string | null; decision_link_reason: string | null; decision_link_after_signing: boolean | null };
/** Reads the late-link flag (tolerates the column not existing yet). */
export async function readLate(contractId: string): Promise<Late | null> {
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.from("contract").select("decision_linked_late,decision_linked_late_on,decision_link_reason,decision_link_after_signing").eq("id", contractId).maybeSingle();
    return error ? null : (data as Late | null);
  } catch { return null; }
}

/** Visible «ربط لاحق» flag; never hides a missing prior approval. */
export function LateBadge({ late }: { late: Late | null }) {
  if (!late?.decision_linked_late) return null;
  return (
    <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-2 text-sm leading-6 text-amber-950">
      <b>ربط لاحق</b> — رُبط القرار بعد إنشاء العقد{late.decision_linked_late_on ? ` (${late.decision_linked_late_on.slice(0, 10)})` : ""}. {late.decision_link_after_signing === true ? "القرار لاحق لتاريخ التوقيع: لم تكن موافقة سابقة قائمة وقت التوقيع. " : late.decision_link_after_signing === null ? "تعذّر مقارنة تاريخ القرار بالتوقيع. " : ""}السبب: {late.decision_link_reason ?? "—"}
    </p>);
}

export function LateLinkForm({ contractId, back, decisions }: { contractId: string; back?: string; decisions: { id: string; label: string }[] }) {
  return (
    <details><summary className="cursor-pointer text-sm font-bold text-primary">ربط قرار لاحق بالعقد (يُوسم «ربط لاحق»)</summary>
      <form action={linkDecisionLate} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="contract" value={contractId} />{back && <input type="hidden" name="back" value={back} />}
        <label className="text-sm">القرار<select name="decision" required defaultValue="" className={`${fld} block max-w-64`}><option value="" disabled>اختر…</option>{decisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        <label className="text-sm">السبب الموثَّق (إلزامي، 15 حرفًا فأكثر)<input name="reason" required minLength={15} maxLength={2000} className={`${fld} block w-72`} /></label>
        <button className={btn}>ربط</button></form>
      <p className="mt-1 text-sm text-muted-foreground">لا تتغير تواريخ التوقيع أو النشر أو القرار؛ يُسجَّل حدث تدقيق ويبقى وسم «ربط لاحق» ظاهرًا دائمًا.</p></details>);
}
