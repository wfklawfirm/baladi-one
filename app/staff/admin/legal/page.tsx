import { Shell, Badge, Chips, DeadlineBadge, Refs, AddNew, MoreFields, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
import { Empty, Explain, Field, StepCard } from "@/components/simple/kit";
import { LEGAL_KIND, LEGAL_STATUS, deadlineState, loadList } from "@/lib/admin";
import { addLegal, addLegalDeadline, setLegalDeadlineDone, updateLegal } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الشؤون القانونية — BALADI ONE", referrer: "no-referrer" as const };
const BASE = "/staff/admin/legal";

export default async function Legal({ searchParams }: { searchParams: Promise<{ k?: string; q?: string; err?: string }> }) {
  const { sb, today } = await guard();
  const sp = await searchParams;
  const [mt, dl, refs] = await Promise.all([
    loadList(sb, "legal_matter", "id,kind,title,ref_no,court,opposing_party,lawyer,opened_on,judgment_on,next_hearing_on,outcome,status,notes", { col: "created_at" }),
    loadList(sb, "legal_deadline", "id,matter_id,label,due_on,entered_by,done", { col: "due_on", asc: true }, 3000),
    loadList(sb, "admin_ref", "id,entity_id,title,ref", undefined, 2000),
  ]);
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = mt.rows.filter((r) => (!sp.k || r.kind === sp.k) && (!needle || `${r.title} ${r.ref_no ?? ""} ${r.court ?? ""} ${r.opposing_party ?? ""}`.toLowerCase().includes(needle)));
  const upcoming = dl.rows.filter((d) => !d.done && deadlineState(d.due_on, today) !== "ok" && deadlineState(d.due_on, today) !== null);
  const chip = (k?: string) => (k ? `${BASE}?k=${k}` : BASE);
  return (
    <Shell title="الشؤون القانونية" sub="هنا تتابعون الدعاوى والمطالبات والاستشارات القانونية. المهل (مثل مهلة الاستئناف) يكتبها المحامي، والنظام لا يحسبها بنفسه ليتجنّب الخطأ." err={sp.err} missing={mt.missing}>
      {upcoming.length > 0 && (
        <section aria-label="مهل قريبة" className="space-y-1 rounded-2xl border-2 border-destructive/40 p-4"><b className="text-base text-destructive">⚠ مهل فات موعدها أو تنتهي خلال 7 أيام — انتبهوا</b>
          <ul className="text-sm">{upcoming.map((d) => { const m = mt.rows.find((x) => x.id === d.matter_id); return <li key={d.id}><DeadlineBadge state={deadlineState(d.due_on, today)} due={d.due_on} /> {d.label} — {m?.title ?? ""}</li>; })}</ul></section>)}
      <form className="flex flex-wrap gap-2">{sp.k && <input type="hidden" name="k" value={sp.k} />}<input name="q" defaultValue={sp.q} placeholder="ابحثوا بالعنوان أو الرقم أو المحكمة…" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>ابحث</button></form>
      <Chips items={[{ href: chip(), on: !sp.k, label: "كل الملفات" }, ...Object.entries(LEGAL_KIND).map(([k, v]) => ({ href: chip(k), on: sp.k === k, label: v }))]} />
      <p className="text-base text-muted-foreground">{rows.length} ملف</p>
      {rows.length === 0 ? <Empty>لا توجد ملفات قانونية بعد. اضغطوا «＋ أفتح ملفًا قانونيًا» في الأسفل.</Empty> : (
        <ul className="fill-odd grid gap-3 lg:grid-cols-2">
          {rows.map((r) => { const ds = dl.rows.filter((d) => d.matter_id === r.id); const open = ds.filter((d) => !d.done); return (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ok">{LEGAL_KIND[r.kind]}</Badge><Badge>{LEGAL_STATUS[r.status]}</Badge>{r.ref_no && <Badge>رقم {r.ref_no}</Badge>}
                {open.slice(0, 1).map((d) => <DeadlineBadge key={d.id} state={deadlineState(d.due_on, today)} due={d.due_on} />)}</div>
              <b className="block text-base text-primary">{r.title}</b>
              <p className="text-sm text-muted-foreground">{[r.court, r.opposing_party ? `الخصم: ${r.opposing_party}` : null, r.lawyer ? `المحامي: ${r.lawyer}` : null, r.next_hearing_on ? `الجلسة القادمة ${r.next_hearing_on}` : null, r.judgment_on ? `تاريخ الحكم ${r.judgment_on}` : null].filter(Boolean).join(" · ") || "—"}</p>
              {r.outcome && <p className="text-sm">النتيجة: {r.outcome}</p>}
              <details><summary className="cursor-pointer text-sm font-bold text-primary">أفتح المهل والتحديث ({ds.length} مهلة)</summary>
                <div className="mt-3 space-y-3">
                  <div className="space-y-2 rounded-xl border p-3"><b className="text-base">المهل (يكتبها المحامي)</b>
                    {ds.length === 0 ? <p className="text-sm text-muted-foreground">لم تُسجَّل مهلة بعد.</p> : <ul className="space-y-1.5 text-sm">{ds.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-2"><span>{d.label} — {d.due_on} (أدخلها: {d.entered_by})</span>
                      <DeadlineBadge state={deadlineState(d.due_on, today, d.done)} /> {d.done && <Badge>منجزة</Badge>}
                      <form action={setLegalDeadlineDone}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="done" value={d.done ? "0" : "1"} /><button className="text-sm underline">{d.done ? "أعد فتحها" : "اضغط إذا انتهت"}</button></form></li>)}</ul>}
                    <form action={addLegalDeadline} className="grid gap-2 sm:grid-cols-4"><input type="hidden" name="matter" value={r.id} />
                      <input name="label" required maxLength={300} placeholder="المهلة (مثال: مهلة الاستئناف)" aria-label="المهلة" className={`${field} sm:col-span-2`} /><input type="date" name="due" required aria-label="تاريخ الاستحقاق" className={field} />
                      <input name="entered_by" required maxLength={200} defaultValue={r.lawyer ?? ""} placeholder="اسم المحامي" aria-label="المحامي" className={field} /><button className={`${small} sm:col-span-4`}>أضف المهلة</button></form></div>
                  <form action={updateLegal} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={r.id} />
                    <label className={lbl}>وضع الملف الآن<select name="status" defaultValue={r.status} className={field}>{Object.entries(LEGAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label className={lbl}>المحامي<input name="lawyer" defaultValue={r.lawyer ?? ""} maxLength={200} className={field} /></label>
                    <label className={lbl}>الجلسة القادمة<input type="date" name="next_hearing" defaultValue={r.next_hearing_on ?? ""} className={field} /></label>
                    <label className={lbl}>تاريخ صدور الحكم<input type="date" name="judgment_on" defaultValue={r.judgment_on ?? ""} className={field} /></label>
                    <label className={`${lbl} sm:col-span-2`}>النتيجة / الملخص<textarea name="outcome" rows={2} maxLength={3000} defaultValue={r.outcome ?? ""} className={area} /></label>
                    <button className={`${submit} sm:col-span-2`}>احفظ التعديلات</button></form>
                  <Refs refs={refs.rows.filter((x) => x.entity_id === r.id)} entity="legal_matter" id={r.id} back={BASE} />
                </div></details>
            </li>); })}
        </ul>)}
      <AddNew title="أفتح ملفًا قانونيًا جديدًا" intro="اكتبوا ما تعرفونه الآن؛ والمهل يضيفها المحامي بعد ذلك.">
        <form action={addLegal} className="space-y-4">
          <StepCard n={1} title="ما هذا الملف؟">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نوعه"><select name="kind" className={field}>{Object.entries(LEGAL_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="عنوانه" required example="دعوى إزالة تعدٍّ على الرصيف"><input name="title" required maxLength={500} className={field} /></Field>
            </div>
          </StepCard>
          <StepCard n={2} title="تفاصيل (اختيارية)" hint="املؤوا ما تعرفونه فقط.">
            <MoreFields label="أفتح التفاصيل">
              <Field label="رقم الملف"><input name="ref_no" maxLength={100} className={field} /></Field>
              <Field label="المحكمة أو الجهة"><input name="court" maxLength={300} className={field} /></Field>
              <Field label="الطرف المقابل"><input name="opposing" maxLength={300} className={field} /></Field>
              <Field label="المحامي"><input name="lawyer" maxLength={200} className={field} /></Field>
              <Field label="تاريخ فتح الملف"><input type="date" name="opened_on" className={field} /></Field>
              <Field label="تاريخ الحكم (إن صدر)"><input type="date" name="judgment_on" className={field} /></Field>
              <div className="sm:col-span-2"><Field label="ملاحظات"><textarea name="notes" rows={2} maxLength={5000} className={area} /></Field></div>
            </MoreFields>
            <Explain term="لماذا لا يحسب النظام المهل؟">مهل الاستئناف والتقادم تختلف بحسب نوع الدعوى، وخطأ يوم واحد قد يُضيّع الحق. لذلك يكتبها المحامي ويُسجَّل اسمه معها.</Explain>
          </StepCard>
          <button className={`${submit} w-full sm:w-auto`}>احفظ الملف</button>
        </form>
      </AddNew>
    </Shell>
  );
}
