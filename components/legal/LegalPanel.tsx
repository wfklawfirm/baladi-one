import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

export const REVIEW: Record<string, string> = { verified: "مراجَع قانونيًا", pending_review: "بانتظار المراجعة القانونية", superseded: "معدَّل/مستبدل", repealed: "ملغى", not_applicable: "غير منطبق" };
export const ENFORCE: Record<string, string> = { BLOCK: "يمنع الإجراء", WARNING: "تنبيه", INFORMATION: "معلومة" };
export type Rule = { rule_id: string; instrument: string; instrument_no: string | null; article: string | null; topic: string; summary_ar: string; conditions_ar: string | null; exceptions_ar: string | null; deadline_ar: string | null; required_docs_ar: string | null; source_url: string | null; enforcement: string; review_status: string; original_text_loaded: boolean; last_checked_on: string | null; version: number };

/** المرجعية القانونية والامتثال — reads the rules registry; never presents an unreviewed rule as confirmed. */
export default async function LegalPanel({ workflow }: { workflow: string }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("legal_rule").select("*").eq("workflow", workflow).order("rule_id");
  const rules = (data ?? []) as Rule[];
  if (rules.length === 0) return null;
  return (
    <details className="elev rounded-2xl border bg-background p-4">
      <summary className="cursor-pointer font-bold text-primary">⚖ المرجعية القانونية والامتثال ({rules.length})</summary>
      <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs leading-6 text-amber-950">مرجعيات مستخرجة من مصادر منشورة وبانتظار مراجعة قانونية؛ النص الرسمي الأصلي غير محمَّل بعد. لا تُعدّ تأكيدًا نهائيًا للمطابقة.</p>
      <ul className="mt-3 space-y-3 text-sm">{rules.map((r) => (
        <li key={r.rule_id} className="space-y-1 rounded-xl border p-3">
          <p className="font-bold">{r.topic} <span className="text-xs font-normal text-muted-foreground">— {r.instrument} {r.instrument_no} · م.{r.article}</span></p>
          <p className="leading-7">{r.summary_ar}</p>
          {r.conditions_ar && <p className="text-xs"><b>الشروط:</b> {r.conditions_ar}</p>}
          {r.exceptions_ar && <p className="text-xs"><b>الاستثناءات:</b> {r.exceptions_ar}</p>}
          {r.deadline_ar && <p className="text-xs"><b>المهلة:</b> {r.deadline_ar}</p>}
          {r.required_docs_ar && <p className="text-xs"><b>المستندات:</b> {r.required_docs_ar}</p>}
          <p className="text-[11px] text-muted-foreground">{ENFORCE[r.enforcement]} · {REVIEW[r.review_status]} · {r.original_text_loaded ? "النص الأصلي محمَّل" : "النص الأصلي غير محمَّل"}{r.last_checked_on ? ` · آخر تحقق ${r.last_checked_on}` : ""}{r.source_url && <> · <a href={r.source_url} target="_blank" rel="noreferrer" className="text-primary underline">المصدر</a></>}</p>
        </li>))}</ul>
      <Link href="/staff/legal" className="mt-2 block text-xs font-bold text-primary">سجل القواعد القانونية كاملًا ←</Link>
    </details>
  );
}
