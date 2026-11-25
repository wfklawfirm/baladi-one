import { Shell, Badge, Chips, DeadlineBadge, AddNew, MoreFields, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
import { Empty, Explain, Field, StepCard } from "@/components/simple/kit";
import { INFO_STATUS, NEEDS_VERIFICATION, canPublish, deadlineState, loadList, suggestedDue } from "@/lib/admin";
import { addInfoRequest, setInfoDefaultDays, setInfoPublication, updateInfoRequest } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الشفافية والمعلومات — BALADI ONE", referrer: "no-referrer" as const };
const BASE = "/staff/admin/transparency";
const DONE = ["replied", "refused", "closed"];

export default async function Transparency({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; err?: string }> }) {
  const { sb, today } = await guard();
  const sp = await searchParams;
  const [rq, st] = await Promise.all([
    loadList(sb, "info_request", "id,requester_name,contact,subject,received_on,due_on,replied_on,reply_summary,status,contains_personal_data,redaction_required,redaction_done,publishable", { col: "received_on" }),
    loadList(sb, "admin_setting", "key,int_value,verified,note"),
  ]);
  const def = st.rows.find((r) => r.key === "info_request_default_days");
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = rq.rows.filter((r) => (!sp.s || r.status === sp.s) && (!needle || `${r.subject} ${r.requester_name}`.toLowerCase().includes(needle)));
  const sug = suggestedDue(today, def?.int_value);
  return (
    <Shell title="الشفافية والوصول إلى المعلومات" sub="حين يطلب مواطن معلومة من البلدية، تسجّلونها هنا وتتابعون الرد عليها في موعده. اسم مقدّم الطلب سري ولا يراه العموم." err={sp.err} missing={rq.missing}>
      <section className="rounded-2xl border-2 border-primary/40 bg-accent p-4 text-base leading-8 text-primary">
        <b className="block">لا يُنشر شيء تلقائيًا</b>
        علامة «قابل للنشر» تُسجَّل فقط؛ ولا تُفعَّل قبل إتمام الحجب/التنقيح عند وجوده، والمحاضر السرية والبيانات الشخصية لا تُنشر. مهلة الرد القانونية غير مُدرجة في النظام: تُدخَل لكل طلب أو تُضبط كقيمة افتراضية «{NEEDS_VERIFICATION}».
      </section>
      <details className="rounded-2xl border bg-background p-4"><summary className="cursor-pointer text-base font-bold text-primary">كم يومًا نردّ عادةً؟ (المهلة الافتراضية): {def?.int_value ? `${def.int_value} يومًا (${def.verified ? "محقَّقة" : NEEDS_VERIFICATION})` : "غير مضبوطة"}</summary>
        <form action={setInfoDefaultDays} className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className={lbl}>عدد الأيام (فارغ = بلا افتراضي)<input name="days" inputMode="numeric" defaultValue={def?.int_value ?? ""} className={field} /></label>
          <label className={`${lbl} sm:col-span-2`}>السند القانوني<input name="note" defaultValue={def?.note ?? ""} maxLength={500} className={field} /></label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="verified" defaultChecked={def?.verified} className="size-5" />تم التحقق قانونيًا</label>
          <p className="text-xs text-muted-foreground sm:col-span-4">تُستعمل القيمة لتعبئة تاريخ الاستحقاق مسبقًا فقط، ويمكن تعديله لكل طلب.</p>
          <button className={`${small} sm:col-span-4`}>احفظ المهلة</button></form></details>
      <form className="flex flex-wrap gap-2">{sp.s && <input type="hidden" name="s" value={sp.s} />}<input name="q" defaultValue={sp.q} placeholder="ابحثوا بالموضوع أو اسم مقدّم الطلب…" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>ابحث</button></form>
      <Chips items={[{ href: BASE, on: !sp.s, label: "كل الطلبات" }, ...Object.entries(INFO_STATUS).map(([k, v]) => ({ href: `${BASE}?s=${k}`, on: sp.s === k, label: v }))]} />
      <p className="text-base text-muted-foreground">{rows.length} طلب</p>
      {rows.length === 0 ? <Empty>لا توجد طلبات معلومات بعد. اضغطوا «＋ أسجّل طلب معلومات» في الأسفل.</Empty> : (
        <ul className="fill-odd grid gap-3 lg:grid-cols-2">
          {rows.map((r) => { const ok = canPublish(r as any); return (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ok">{INFO_STATUS[r.status]}</Badge><DeadlineBadge state={deadlineState(r.due_on, today, DONE.includes(r.status))} due={r.due_on} />
                {!r.due_on && !DONE.includes(r.status) && <Badge tone="warn">لا موعد استحقاق مُدخل</Badge>}
                {r.contains_personal_data && <Badge tone="warn">بيانات شخصية</Badge>}{r.publishable && <Badge tone="ok">قابل للنشر</Badge>}{r.redaction_required && !r.redaction_done && <Badge tone="bad">حجب مطلوب</Badge>}</div>
              <b className="block text-base text-primary">{r.subject}</b>
              <p className="text-sm text-muted-foreground">مقدّم الطلب: {r.requester_name} (سري — للموظفين) · الاستلام {r.received_on}{r.replied_on ? ` · الرد ${r.replied_on}` : ""}</p>
              <details><summary className="cursor-pointer text-sm font-bold text-primary">أردّ على الطلب أو أقرّر النشر</summary>
                <div className="mt-2 space-y-3">
                  <form action={updateInfoRequest} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={r.id} />
                    <label className={lbl}>أين وصل الطلب؟<select name="status" defaultValue={r.status} className={field}>{Object.entries(INFO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label className={lbl}>آخر موعد للرد<input type="date" name="due_on" defaultValue={r.due_on ?? ""} className={field} /></label>
                    <label className={lbl}>تاريخ الرد<input type="date" name="replied_on" defaultValue={r.replied_on ?? ""} className={field} /></label>
                    <label className={`${lbl} sm:col-span-2`}>ملخص الرد / سبب الرفض<textarea name="reply_summary" rows={2} maxLength={5000} defaultValue={r.reply_summary ?? ""} className={area} /></label>
                    <button className={`${submit} sm:col-span-2`}>احفظ الرد</button></form>
                  <form action={setInfoPublication} className="space-y-2 rounded-xl border p-3"><input type="hidden" name="id" value={r.id} /><b className="text-base">هل نستطيع نشر الجواب؟</b>
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="personal" defaultChecked={r.contains_personal_data} className="size-5" />يتضمن بيانات شخصية أو سرية (يوجب الحجب)</label>
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="redaction_required" defaultChecked={r.redaction_required} className="size-5" />الحجب/التنقيح مطلوب</label>
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="redaction_done" defaultChecked={r.redaction_done} className="size-5" />تم الحجب/التنقيح</label>
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="publishable" defaultChecked={r.publishable} className="size-5" />قابل للنشر</label>
                    {!ok && <p className="text-sm text-destructive">لا يُسمح بالنشر قبل إتمام الحجب.</p>}
                    <button className={small}>احفظ قرار النشر</button></form>
                </div></details>
            </li>); })}
        </ul>)}
      <AddNew title="أسجّل طلب معلومات جديدًا" intro="اكتبوا من طلب، وماذا طلب، ومتى وصل الطلب.">
        <form action={addInfoRequest} className="space-y-4">
          <StepCard n={1} title="من طلب وماذا طلب؟">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم مقدّم الطلب" required><input name="requester" required maxLength={300} className={field} /></Field>
              <Field label="تاريخ وصول الطلب"><input type="date" name="received_on" required defaultValue={today} className={field} /></Field>
              <div className="sm:col-span-2"><Field label="ما المعلومة المطلوبة؟" required example="نسخة عن موازنة العام الماضي"><input name="subject" required maxLength={2000} className={field} /></Field></div>
            </div>
          </StepCard>
          <StepCard n={2} title="موعد الرد" hint={sug ? `اقترحنا ${sug} من المهلة الافتراضية؛ يمكنكم تغييره.` : "لا مهلة افتراضية مضبوطة؛ اتركوه فارغًا أو اكتبوا الموعد."}>
            <MoreFields label="أفتح الخيارات">
              <Field label={`آخر موعد للرد (${NEEDS_VERIFICATION})`}><input type="date" name="due_on" defaultValue={sug ?? ""} className={field} /></Field>
              <Field label="كيف نتواصل معه؟ (هاتف أو بريد)"><input name="contact" maxLength={300} className={field} /></Field>
              <label className="flex min-h-12 items-center gap-2 text-base sm:col-span-2"><input type="checkbox" name="personal" className="size-5" />الطلب أو الجواب فيه بيانات شخصية</label>
            </MoreFields>
            <Explain term="لماذا لا يوجد موعد ثابت؟">مدة الرد يحدّدها النص القانوني ويتحقق منه المحامي؛ لذلك لا نكتب رقمًا من عندنا.</Explain>
          </StepCard>
          <button className={`${submit} w-full sm:w-auto`}>سجّل الطلب</button>
        </form>
      </AddNew>
    </Shell>
  );
}
