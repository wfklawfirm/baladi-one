import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { loadSources, loadTemplates } from "@/lib/decisions/load";
import { seedPayload } from "@/lib/decisions/seed";
import { ISSUER_LABEL, STATUS_LABEL, type TplStatus } from "@/lib/decisions/model";
import { bulkApprove, importSeed, setLegalProfile, setSourceDate } from "../actions";
import SelectAll from "@/components/decisions/SelectAll";
import { errText } from "@/lib/decisions/errors";
import { Intro, StepCard, Field, Chip, Empty, Notice, Explain, CONTROL, BTN_PRIMARY, BTN_SECONDARY } from "@/components/simple/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "إدارة قوالب القرارات — BALADI ONE", referrer: "no-referrer" as const };
const inp = CONTROL;
const TONE: Record<string, "ok" | "wait" | "bad" | "info"> = { approved: "ok", pending_legal_review: "wait", draft: "info", superseded: "info", archived: "info" };

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; err?: string; imported?: string; profile?: string; approved?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "admin" || m.role === "mayor")) redirect("/staff");
  const isAdmin = memberships.some((m) => m.role === "admin");
  const sp = await searchParams;
  const [{ rows }, sources, muni] = await Promise.all([loadTemplates(sb), loadSources(sb), sb.from("municipality").select("name_ar,letterhead_name_ar,governorate_ar,district_ar,legal_profile_verified_on,legal_profile_note").limit(1).maybeSingle()]);
  const seed = seedPayload();
  const needle = (sp.q ?? "").trim().toLowerCase();
  const list = rows.filter((r) => (!sp.s || r.status === sp.s) && (!needle || r.title_ar.toLowerCase().includes(needle) || r.template_id.toLowerCase().includes(needle)));
  const counts = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  const known = new Set(rows.map((r) => r.template_id));
  const toImport = seed.items.filter((i) => !known.has(i.id)).length;
  return (
    <>
      <StaffHeader back="/staff/decisions" backLabel="المنشئ" />
      <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
        <Intro title="نماذج القرارات الجاهزة">هذه هي النماذج التي تستعملها لكتابة قراراتك. كل نموذج يمرّ بمراجعة قانونية قبل أن يصبح «معتمدًا» ويُستعمل رسميًا.</Intro>
        <Explain term="بانتظار المراجعة القانونية">النموذج جاهز للكتابة، لكن لم يؤكد محامٍ بعد أن نصّه يطابق القانون. تستطيع تجربته كمسودة، أما النسخة الرسمية فلا تظهر قبل اعتماده. ولا يعتمد النموذجَ الشخصُ نفسه الذي قدّمه.</Explain>
        {sp.err && <Notice tone="bad">{errText({ message: sp.err })}</Notice>}
        {sp.imported && <Notice>تم إدخال {sp.imported} نموذجًا، وهي الآن بانتظار المراجعة القانونية. لم يُعتمد أي منها بعد.</Notice>}
        {sp.approved && <Notice>تم اعتماد {sp.approved} نموذجًا بقرار منك، وسُجّل ذلك باسمك.</Notice>}
        {sp.profile && <Notice>تم حفظ بيانات البلدية.</Notice>}

        {toImport > 0 && <StepCard n={1} title="أدخل النماذج الجاهزة" hint={`يوجد ${toImport} نموذجًا لم يُدخل بعد (من أصل ${seed.total}). هي مسودات مقترحة وليست نصوصًا رسمية. لن تُستبدل أي نماذج موجودة عندك.`}>
          <form action={importSeed}><button className={BTN_PRIMARY}>إدخال {toImport} نموذجًا</button></form></StepCard>}

        <section className="grid gap-4 md:grid-cols-2">
          <StepCard n={toImport > 0 ? 2 : 1} title="اسم البلدية على أعلى القرار" hint="هذا ما يظهر في رأس كل قرار تطبعه.">
          <form action={setLegalProfile} className="space-y-3">
            <Field label="اسم البلدية" hint={`يظهر هكذا: «بلدية …». إن تركته فارغًا نستعمل: ${muni.data?.name_ar ?? "الاسم المسجّل"}`} example="الخريبة"><input name="letterhead" defaultValue={muni.data?.letterhead_name_ar ?? ""} placeholder={muni.data?.name_ar ?? ""} className={inp} /></Field>
            <Field label="المحافظة" example="جبل لبنان"><input name="governorate" defaultValue={muni.data?.governorate_ar ?? ""} className={inp} /></Field>
            <Field label="القضاء" example="الشوف"><input name="district" defaultValue={muni.data?.district_ar ?? ""} className={inp} /></Field>
            <details className="rounded-xl bg-muted/50 px-3 py-2"><summary className="cursor-pointer font-semibold">حقول إضافية</summary>
              <div className="space-y-3 pt-3">
                <Field label="ملاحظة"><input name="note" defaultValue={muni.data?.legal_profile_note ?? ""} className={inp} /></Field>
                <label className="flex items-center gap-2 text-base"><input type="checkbox" name="verified" defaultChecked={!!muni.data?.legal_profile_verified_on} className="size-5" />تأكدتُ من هذه البيانات من مصدر رسمي</label></div></details>
            <button className={BTN_SECONDARY}>حفظ</button></form></StepCard>
          <StepCard title={`مراجع القوانين (${sources.length})`} hint="لكل مرجع تاريخ يبدأ فيه العمل به. يدخله المراجع القانوني ولا نخمّنه.">
            <ul className="max-h-72 space-y-2 overflow-auto text-base">{sources.map((s) => <li key={s.source_id} className="flex flex-wrap items-center gap-2 border-b py-2"><span className="min-w-0 flex-1">{s.title}</span>
              {isAdmin ? <form action={setSourceDate} className="flex items-center gap-2"><input type="hidden" name="source" value={s.source_id} /><input type="date" name="effective" defaultValue={s.effective_from ?? ""} aria-label="يبدأ العمل به في" className="min-h-11 rounded-lg border-2 px-2 text-base" /><button className={BTN_SECONDARY}>حفظ</button></form> : <span className="text-sm">{s.effective_from ?? "لم يُحدَّد"}</span>}</li>)}</ul></StepCard>
        </section>

        <div className="flex flex-wrap gap-2 text-base">{(["", "pending_legal_review", "approved", "draft", "superseded", "archived"] as const).map((s) => <Link key={s} href={s ? `/staff/decisions/templates?s=${s}` : "/staff/decisions/templates"} className={`min-h-12 rounded-full border-2 px-4 py-2.5 ${(sp.s ?? "") === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{s ? STATUS_LABEL[s as TplStatus] : "الكل"} ({s ? counts[s] ?? 0 : rows.length})</Link>)}</div>
        <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="ابحث باسم النموذج" aria-label="بحث" className={inp} />{sp.s && <input type="hidden" name="s" value={sp.s} />}<button className={BTN_SECONDARY}>بحث</button></form>
        {list.length === 0 ? <Empty>لا توجد نماذج بهذا الفرز. اختر «الكل» أو غيّر كلمة البحث.</Empty> : (
          <form action={bulkApprove} className="space-y-3">
            <SelectAll />
            <ul className="divide-y rounded-2xl border bg-background">{list.map((r) => <li key={r.id} className="flex items-center gap-2 pe-3">
              {r.status === "pending_legal_review" ? <input type="checkbox" name="ids" value={r.id} defaultChecked={false} aria-label={`تحديد ${r.title_ar}`} className="ms-3 size-6" /> : <span className="ms-3 w-6" />}
              <Link href={`/staff/decisions/templates/${r.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted"><span className="text-lg font-semibold">{r.title_ar}</span><span className="text-sm text-muted-foreground">{ISSUER_LABEL[r.issuer]} · إصدار {r.version}</span><Chip tone={TONE[r.status] ?? "info"}>{STATUS_LABEL[r.status]}</Chip></Link></li>)}</ul>
            {list.some((r) => r.status === "pending_legal_review") && (
              <StepCard title="اعتمد النماذج التي حدّدتها" hint="ضع علامة على النماذج أعلاه. يُسجَّل الاعتماد باسمك وتاريخه. اعتماد النموذج لا يؤكد القواعد القانونية التي يستند إليها؛ تلك تبقى «لم تُؤكَّد» حتى يراجعها محامٍ، ولا تظهر النسخة الرسمية قبل ذلك.">
                <Field label="ملاحظتك" hint="سطر يوضح أساس اعتمادك." example="روجعت مع النص الرسمي" required><input name="note" required className={inp} /></Field>
                <Field label="من أي تاريخ يبدأ العمل بها؟" required><input type="date" name="effective" required className={inp} /></Field>
                <label className="flex items-start gap-2 text-base"><input type="checkbox" name="confirm" required className="mt-1 size-6" />أقرّ أنني راجعت النماذج المحددة قانونيًا وأتحمل مسؤولية اعتمادها.</label>
                <button className={`${BTN_PRIMARY} w-full`}>اعتماد المحدد</button></StepCard>)}
          </form>)}
      </main>
    </>
  );
}
