import Link from "next/link";
import { redirect } from "next/navigation";
import StaffHeader from "@/components/StaffHeader";
import { requireStaff } from "@/lib/supabase-server";
import { ENFORCE, REVIEW, type Rule } from "@/components/legal/LegalPanel";

export const dynamic = "force-dynamic";
const WF: Record<string, string> = { council: "المجلس", decisions: "القرارات", procurement: "الشراء والعقود" };

export default async function LegalRegistry() {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { data } = await sb.from("legal_rule").select("*").order("workflow").order("rule_id");
  const rules = (data ?? []) as (Rule & { workflow: string })[];
  const pending = rules.filter((r) => r.review_status === "pending_review").length;
  return (
    <><StaffHeader />
      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-bold">⚖ سجل القواعد القانونية</h1><Link href="/staff/legal/updates" className="rounded-xl border px-4 py-2 text-sm font-semibold text-primary active:bg-muted">مستجدات التشريع ←</Link></div>
        <p className="rounded-2xl border border-amber-400/60 bg-amber-50 p-3 text-sm leading-7 text-amber-950">{rules.length} قاعدة، منها {pending} بانتظار المراجعة القانونية. لا قاعدة هنا مؤكَّدة نهائيًا قبل اعتماد محامٍ مختص وتحميل النص الرسمي من الجريدة الرسمية. لا مبالغ أو سقوف مالية مثبتة في الشيفرة.</p>
        {rules.length === 0 ? <p className="text-sm text-muted-foreground">لا قواعد مسجّلة.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">{rules.map((r) => (
            <li key={r.rule_id} className="elev space-y-1 rounded-2xl border bg-background p-4 text-sm">
              <p className="font-bold">{r.topic}</p>
              <p className="text-xs text-muted-foreground">{r.rule_id} · {r.instrument} {r.instrument_no} · م.{r.article} · {WF[r.workflow] ?? r.workflow}</p>
              <p className="leading-7">{r.summary_ar}</p>
              {r.exceptions_ar && <p className="text-xs"><b>الاستثناءات:</b> {r.exceptions_ar}</p>}
              <p className="text-[11px] text-muted-foreground">{ENFORCE[r.enforcement]} · {REVIEW[r.review_status]} · {r.original_text_loaded ? "النص الأصلي محمَّل" : "النص الأصلي غير محمَّل"} · نسخة {r.version}{r.source_url && <> · <a href={r.source_url} target="_blank" rel="noreferrer" className="text-primary underline">المصدر</a></>}</p>
            </li>))}</ul>)}
      </main></>
  );
}
