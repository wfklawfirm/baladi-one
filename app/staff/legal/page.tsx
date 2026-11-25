import Link from "next/link";
import { redirect } from "next/navigation";
import StaffHeader from "@/components/StaffHeader";
import { requireStaff } from "@/lib/supabase-server";
import { ENFORCE, SURE, type Rule } from "@/components/legal/LegalPanel";
import { Intro, Chip, Empty, Explain, Notice, BTN_SECONDARY } from "@/components/simple/kit";

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
      <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4">
        <Intro title="القواعد القانونية">هنا القواعد التي يعتمد عليها التطبيق لتنبيهك. بجانب كل قاعدة تجد هل هي «مؤكدة» أم لا.</Intro>
        <Link href="/staff/legal/updates" className={BTN_SECONDARY}>ما الجديد في القانون؟ ←</Link>
        {rules.length > 0 && <Notice tone={pending ? "bad" : "ok"}>{pending ? `${pending} من ${rules.length} قاعدة لم يؤكدها محامٍ بعد، لذا لا تعتمد عليها وحدها في قرار رسمي.` : `كل القواعد (${rules.length}) مؤكدة.`}</Notice>}
        <Explain term="قاعدة مؤكدة">قاعدة راجعها محامٍ مختص وطابقها مع النص الرسمي في الجريدة الرسمية. غير المؤكدة هي ملخص مأخوذ من مصدر منشور، ويصلح للاسترشاد فقط.</Explain>
        {rules.length === 0 ? <Empty>لا توجد قواعد مسجّلة بعد.</Empty> : (
          <ul className="grid gap-3 md:grid-cols-2">{rules.map((r) => { const [lbl, tone] = SURE[r.review_status] ?? SURE.pending_review; return (
            <li key={r.rule_id} className="elev space-y-2 rounded-2xl border bg-background p-4 text-base">
              <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-bold">{r.topic}</p><Chip tone={tone}>{lbl}</Chip></div>
              <p className="leading-7">{r.summary_ar}</p>
              {r.exceptions_ar && <p className="text-sm"><b>الاستثناءات:</b> {r.exceptions_ar}</p>}
              <p className="text-sm text-muted-foreground">المرجع: {r.instrument} {r.instrument_no} · المادة {r.article} · يخصّ: {WF[r.workflow] ?? r.workflow}</p>
              <p className="text-sm text-muted-foreground">{ENFORCE[r.enforcement]} · {r.original_text_loaded ? "النص الرسمي محفوظ عندنا" : "النص الرسمي لم يُحمَّل بعد"}{r.source_url && <> · <a href={r.source_url} target="_blank" rel="noreferrer" className="text-primary underline">فتح المصدر</a></>}</p>
            </li>); })}</ul>)}
      </main></>
  );
}
