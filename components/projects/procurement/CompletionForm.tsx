import { supabaseServer } from "@/lib/supabase-server";
import { completeContract } from "@/app/staff/projects/procurement/actions";
import { btn, fld } from "./data";

/** true/false = acceptance committee record with a positive result exists; null = table not deployed yet. */
export async function acceptanceState(contractId: string): Promise<boolean | null> {
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.from("procurement_committee").select("id").eq("contract_id", contractId).eq("kind", "acceptance").in("result", ["accepted", "accepted_reservations"]).limit(1);
    return error ? null : (data ?? []).length > 0;
  } catch { return null; }
}

/** Completion with acceptance-committee check. Missing acceptance record = WARNING needing explicit acknowledgement (BLOCK only once the rule is verified, enforced by the RPC). */
export default function CompletionForm({ contractId, back, has }: { contractId: string; back?: string; has: boolean | null }) {
  if (has === null) return null;
  return (
    <details><summary className="cursor-pointer text-sm font-bold text-primary">إنهاء العقد بالتنفيذ (فحص محضر الاستلام)</summary>
      <form action={completeContract} className="mt-2 space-y-2"><input type="hidden" name="contract" value={contractId} />{back && <input type="hidden" name="back" value={back} />}
        {has === false && <><p role="alert" className="text-sm font-semibold text-destructive">⚠ لا محضر لجنة استلام بنتيجة إيجابية لهذا العقد. تنبيه لا يمنع الإنهاء ما دامت القاعدة غير مراجَعة قانونيًا.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ack" value="1" /> أُدرك غياب محضر الاستلام وأؤكد الإنهاء</label></>}
        {has === true && <p className="text-sm text-green-700">✔ محضر استلام إيجابي مسجَّل.</p>}
        <div className="flex flex-wrap items-end gap-2"><input name="note" maxLength={400} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className={`${fld} min-w-0`} /><button className={btn}>تأكيد الإنهاء</button></div></form></details>);
}
