import { createDecision } from "@/app/staff/council/actions";
import { BTN_PRIMARY, CONTROL, Field } from "@/components/simple/kit";

/** Register a decision that was already taken. Five fields up front; the rest are optional and can be added later in the decision file. */
export default function DecisionForm({ session }: { session?: string }) {
  return (
    <form action={createDecision} className="mt-4 grid gap-4 sm:grid-cols-3">
      {session && <input type="hidden" name="session" value={session} />}
      <div className="sm:col-span-3"><Field label="عنوان القرار" hint="جملة قصيرة تصف موضوعه." example="الموافقة على تأليف لجنة الاستلام" required><input name="title" required maxLength={300} className={CONTROL} /></Field></div>
      <Field label="رقم القرار" hint="كما هو في سجل القرارات." example="15" required><input name="no" required maxLength={40} className={CONTROL} /></Field>
      <Field label="السنة" required><input name="year" required inputMode="numeric" defaultValue={new Date().getFullYear()} className={CONTROL} /></Field>
      <Field label="تاريخ اتخاذه" hint="اليوم الذي أقرّه فيه المجلس."><input type="date" name="decided_on" className={CONTROL} /></Field>
      <div className="sm:col-span-3"><Field label="نص القرار" hint="الصيغة التي أقرّها المجلس. يمكنكم إضافتها لاحقًا."><textarea name="body" rows={4} maxLength={60000} className="w-full rounded-xl border-2 bg-background p-3 text-base leading-7 outline-none focus:border-primary" /></Field></div>
      <details className="rounded-xl bg-muted/40 p-3 sm:col-span-3"><summary className="cursor-pointer text-base font-semibold">حقول إضافية (اختيارية): الأساس القانوني، التصويت، الرقابة، التنفيذ</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3"><Field label="الأساس القانوني" hint="القانون أو المادة التي يستند إليها القرار، كما ورد فيه."><input name="basis" maxLength={2000} className={CONTROL} /></Field></div>
          <Field label="عدد الأصوات المؤيدة"><input name="vf" inputMode="numeric" className={CONTROL} /></Field>
          <Field label="عدد الأصوات المعارضة"><input name="va" inputMode="numeric" className={CONTROL} /></Field>
          <Field label="عدد الممتنعين"><input name="vb" inputMode="numeric" className={CONTROL} /></Field>
          <Field label="الجهة التي تراقب القرار" hint="مثل القائمقام أو المحافظ."><input name="authority" maxLength={200} className={CONTROL} /></Field>
          <Field label="موعد التنفيذ المتوقع"><input type="date" name="due" className={CONTROL} /></Field>
          <Field label="المسؤول عن التنفيذ" hint="اسم الشخص أو القسم."><input name="responsible" maxLength={200} className={CONTROL} /></Field>
        </div>
      </details>
      <p className="text-sm leading-6 text-muted-foreground sm:col-span-3">يُحفظ القرار «مسودة» وتنفيذه «لم يبدأ». لا يصبح نافذًا من تلقائه: تاريخ النفاذ يُسجَّل لاحقًا من المستند الرسمي.</p>
      <button className={`${BTN_PRIMARY} sm:col-span-3`}>سجّلوا القرار</button>
    </form>
  );
}
