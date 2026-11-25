import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { Chip } from "@/components/simple/kit";

export const REVIEW: Record<string, string> = { verified: "مراجَع قانونيًا", pending_review: "بانتظار المراجعة القانونية", superseded: "معدَّل/مستبدل", repealed: "ملغى", not_applicable: "غير منطبق" };
export const ENFORCE: Record<string, string> = { BLOCK: "يمنع المتابعة إن لم تُستوفَ", WARNING: "تنبيه للانتباه", INFORMATION: "للعلم فقط" };
/** Plain answer to «هل هذه القاعدة مؤكدة؟» */
export const SURE: Record<string, [string, "ok" | "wait" | "bad" | "info"]> = { verified: ["مؤكدة", "ok"], pending_review: ["لم تُؤكَّد بعد", "wait"], superseded: ["عُدّلت", "bad"], repealed: ["أُلغيت", "bad"], not_applicable: ["لا تنطبق", "info"] };
export type Rule = { rule_id: string; instrument: string; instrument_no: string | null; article: string | null; topic: string; summary_ar: string; conditions_ar: string | null; exceptions_ar: string | null; deadline_ar: string | null; required_docs_ar: string | null; source_url: string | null; enforcement: string; review_status: string; original_text_loaded: boolean; last_checked_on: string | null; version: number };

/** المرجعية القانونية والامتثال — reads the rules registry; never presents an unreviewed rule as confirmed. */
export default async function LegalPanel({ workflow }: { workflow: string }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("legal_rule").select("*").eq("workflow", workflow).order("rule_id");
  const rules = (data ?? []) as Rule[];
  if (rules.length === 0) return null;
  return (
    <details className="elev rounded-2xl border bg-background p-4">
      <summary className="cursor-pointer text-base font-bold text-primary">ماذا يقول القانون هنا؟ ({rules.length})</summary>
      <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm leading-7 text-amber-950">هذه ملاحظات مأخوذة من مصادر منشورة ولم يراجعها محامٍ بعد. استعملها كدليل، وليست تأكيدًا نهائيًا أن إجراءك سليم.</p>
      <ul className="mt-3 space-y-3 text-base">{rules.map((r) => (
        <li key={r.rule_id} className="space-y-1 rounded-xl border p-3">
          <p className="flex flex-wrap items-center gap-2 font-bold">{r.topic} <Chip tone={(SURE[r.review_status] ?? SURE.pending_review)[1]}>{(SURE[r.review_status] ?? SURE.pending_review)[0]}</Chip></p>
          <p className="text-sm text-muted-foreground">المرجع: {r.instrument} {r.instrument_no} · المادة {r.article}</p>
          <p className="leading-7">{r.summary_ar}</p>
          {r.conditions_ar && <p className="text-sm"><b>الشروط:</b> {r.conditions_ar}</p>}
          {r.exceptions_ar && <p className="text-sm"><b>الاستثناءات:</b> {r.exceptions_ar}</p>}
          {r.deadline_ar && <p className="text-sm"><b>المهلة:</b> {r.deadline_ar}</p>}
          {r.required_docs_ar && <p className="text-sm"><b>المستندات المطلوبة:</b> {r.required_docs_ar}</p>}
          <p className="text-sm text-muted-foreground">{ENFORCE[r.enforcement]} · {r.original_text_loaded ? "النص الرسمي محفوظ عندنا" : "النص الرسمي لم يُحمَّل بعد"}{r.last_checked_on ? ` · آخر تحقق ${r.last_checked_on}` : ""}{r.source_url && <> · <a href={r.source_url} target="_blank" rel="noreferrer" className="text-primary underline">فتح المصدر</a></>}</p>
        </li>))}</ul>
      <Link href="/staff/legal" className="mt-2 block text-sm font-bold text-primary">كل القواعد القانونية ←</Link>
    </details>
  );
}
