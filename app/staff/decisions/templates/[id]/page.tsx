import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { uuidOk } from "@/lib/council";
import { loadTemplate, loadTemplates } from "@/lib/decisions/load";
import { ISSUER_LABEL, STATUS_LABEL, type TemplateContent } from "@/lib/decisions/model";
import { reviewTemplate, saveTemplate } from "../../actions";
import { errText } from "@/lib/decisions/errors";
import { Intro, StepCard, Field, Chip, Notice, Explain, CONTROL, BTN_PRIMARY, BTN_SECONDARY } from "@/components/simple/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "قالب قرار — BALADI ONE", referrer: "no-referrer" as const };
const inp = CONTROL;
const TONE: Record<string, "ok" | "wait" | "bad" | "info"> = { approved: "ok", pending_legal_review: "wait", draft: "info", superseded: "info", archived: "info" };
const ft = (d: string | null) => (d ? new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeZone: "Asia/Beirut" }).format(new Date(d)) : "—");

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; saved?: string; reviewed?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "admin" || m.role === "mayor")) redirect("/staff");
  const isAdmin = memberships.some((m) => m.role === "admin");
  const sp = await searchParams;
  const t = await loadTemplate(sb, id);
  if (!t) notFound();
  const content = (t as unknown as { content: TemplateContent }).content;
  const { rows } = await loadTemplates(sb);
  const sibs = rows.filter((r) => r.template_id === t.template_id).sort((a, b) => b.seq - a.seq);
  const editable = t.status === "draft" && isAdmin;
  const json = JSON.stringify(content, null, 2);
  return (
    <>
      <StaffHeader back="/staff/decisions/templates" backLabel="القوالب" />
      <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <Intro title={t.title_ar}>{ISSUER_LABEL[t.issuer]} · {t.category_ar}. الحالة الآن: <Chip tone={TONE[t.status] ?? "info"}>{STATUS_LABEL[t.status]}</Chip></Intro>
        <p className="text-base text-muted-foreground">يبدأ العمل به: {ft(t.effective_from)} · اعتُمد في: {ft(t.approved_at)}{t.review_note ? ` · ملاحظة المراجعة: ${t.review_note}` : ""}</p>
        {sp.err && <Notice tone="bad">{sp.err === "json" ? "نص النموذج فيه خطأ في الكتابة، فلم يُحفظ. راجع الأقواس والفواصل ثم حاول ثانية." : errText({ message: sp.err })}</Notice>}
        {(sp.saved || sp.reviewed) && <Notice>تم الحفظ.</Notice>}

        <StepCard n={1} title="هل نعتمد هذا النموذج؟" hint="لا يُعتمد النموذج إلا بعد مطابقته مع القانون الرسمي. ويعتمده شخص غير الذي قدّمه.">
          <form action={reviewTemplate} className="space-y-3"><input type="hidden" name="id" value={t.id} />
            <Field label="ملاحظتك" example="روجع مع النص الرسمي"><input name="note" className={inp} /></Field>
            <Field label="من أي تاريخ يبدأ العمل به؟"><input type="date" name="effective" className={inp} /></Field>
            <div className="flex flex-wrap gap-2">
            {t.status === "draft" && isAdmin && <button name="to" value="pending_legal_review" className={BTN_PRIMARY}>أرسله للمراجعة القانونية</button>}
            {t.status === "pending_legal_review" && <><button name="to" value="approved" className={BTN_PRIMARY}>اعتمده</button>{isAdmin && <button name="to" value="draft" className={BTN_SECONDARY}>أعده إلى مسودة</button>}</>}
            {isAdmin && t.status !== "archived" && t.status !== "pending_legal_review" && <button name="to" value="archived" className={BTN_SECONDARY}>انقله إلى الأرشيف</button>}
            </div></form>
          <Explain term="الأرشيف">النموذج المؤرشف لا يظهر عند كتابة قرار جديد، لكن القرارات القديمة المبنية عليه تبقى كما هي.</Explain></StepCard>

        <StepCard n={2} title="النسخ السابقة واللاحقة" hint="كل قرار يحتفظ بالنسخة التي كُتب بها، حتى لو تغيّر النموذج لاحقًا.">
          <ul className="space-y-2 text-base">{sibs.map((s) => <li key={s.id}><Link href={`/staff/decisions/templates/${s.id}`} className={`underline ${s.id === t.id ? "font-bold" : ""}`}>إصدار {s.version}</Link> — {STATUS_LABEL[s.status]} — يبدأ {ft(s.effective_from)}</li>)}</ul>
          {isAdmin && <form action={saveTemplate} className="space-y-3 border-t pt-3"><input type="hidden" name="template_id" value={t.template_id} /><input type="hidden" name="content" value={json} />
            <Field label="رقم النسخة الجديدة" hint="لإنشاء مسودة جديدة بدايتها هذا النموذج." example="2"><input name="version" required className={inp} dir="ltr" /></Field><button className={BTN_SECONDARY}>أنشئ نسخة جديدة (مسودة)</button></form>}</StepCard>

        <StepCard n={3} title="نص النموذج" hint={editable ? "يمكنك تعديل النص لأنه ما زال مسودة." : "للقراءة فقط. لتعديل نموذج معتمد أنشئ منه نسخة جديدة من الخطوة السابقة."}>
          {editable ? <form action={saveTemplate} className="space-y-3"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="template_id" value={t.template_id} /><input type="hidden" name="version" value={t.version} />
            <Explain term="نص النموذج بصيغته التقنية">هذا هو النموذج مكتوبًا بلغة يفهمها التطبيق (أقواس وفواصل). عدّل الكلمات العربية فقط، ولا تحذف الأقواس والعلامات حولها. إن أخطأت يخبرك التطبيق ولا يحفظ.</Explain>
            <textarea name="content" defaultValue={json} rows={28} dir="ltr" spellCheck={false} className="w-full rounded-xl border-2 p-3 font-mono text-sm" />
            <button className={BTN_PRIMARY}>احفظ المسودة</button></form>
            : <details className="rounded-xl bg-muted/50 px-3 py-2"><summary className="cursor-pointer font-semibold">عرض النص التقني للنموذج</summary><pre dir="ltr" className="mt-3 max-h-[32rem] overflow-auto rounded-xl border bg-muted/30 p-3 text-sm">{json}</pre></details>}</StepCard>
      </main>
    </>
  );
}
