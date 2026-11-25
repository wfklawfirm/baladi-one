import { Shell, Badge, Chips, DeadlineBadge, Refs, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
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
    <Shell title="الشؤون القانونية" sub="دعاوى ومطالبات واستشارات وأحكام. المهل (ومنها مهل الاستئناف) يُدخلها المحامي المختص؛ لا يحتسبها النظام." err={sp.err} missing={mt.missing}>
      {upcoming.length > 0 && (
        <section aria-label="مهل قريبة" className="space-y-1 rounded-2xl border-2 border-destructive/40 p-4"><b className="text-sm text-destructive">مهل متجاوزة أو قريبة (خلال 7 أيام)</b>
          <ul className="text-sm">{upcoming.map((d) => { const m = mt.rows.find((x) => x.id === d.matter_id); return <li key={d.id}><DeadlineBadge state={deadlineState(d.due_on, today)} due={d.due_on} /> {d.label} — {m?.title ?? ""}</li>; })}</ul></section>)}
      <form className="flex flex-wrap gap-2">{sp.k && <input type="hidden" name="k" value={sp.k} />}<input name="q" defaultValue={sp.q} placeholder="بحث بالعنوان أو الرقم أو المحكمة أو الخصم" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>بحث</button></form>
      <Chips items={[{ href: chip(), on: !sp.k, label: "الكل" }, ...Object.entries(LEGAL_KIND).map(([k, v]) => ({ href: chip(k), on: sp.k === k, label: v }))]} />
      <p className="text-sm text-muted-foreground">{rows.length} ملف</p>
      {rows.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا ملفات قانونية.</p> : (
        <ul className="fill-odd grid gap-3 lg:grid-cols-2">
          {rows.map((r) => { const ds = dl.rows.filter((d) => d.matter_id === r.id); const open = ds.filter((d) => !d.done); return (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ok">{LEGAL_KIND[r.kind]}</Badge><Badge>{LEGAL_STATUS[r.status]}</Badge>{r.ref_no && <Badge>رقم {r.ref_no}</Badge>}
                {open.slice(0, 1).map((d) => <DeadlineBadge key={d.id} state={deadlineState(d.due_on, today)} due={d.due_on} />)}</div>
              <b className="block text-base text-primary">{r.title}</b>
              <p className="text-xs text-muted-foreground">{[r.court, r.opposing_party ? `الخصم: ${r.opposing_party}` : null, r.lawyer ? `المحامي: ${r.lawyer}` : null, r.next_hearing_on ? `الجلسة القادمة ${r.next_hearing_on}` : null, r.judgment_on ? `تاريخ الحكم ${r.judgment_on}` : null].filter(Boolean).join(" · ") || "—"}</p>
              {r.outcome && <p className="text-xs">النتيجة: {r.outcome}</p>}
              <details><summary className="cursor-pointer text-sm font-bold text-primary">المهل والمستندات والتحديث ({ds.length} مهلة)</summary>
                <div className="mt-3 space-y-3">
                  <div className="space-y-2 rounded-xl border p-3"><b className="text-sm">المهل (مُدخَلة من المحامي)</b>
                    {ds.length === 0 ? <p className="text-xs text-muted-foreground">لا مهل مسجّلة.</p> : <ul className="space-y-1.5 text-sm">{ds.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-2"><span>{d.label} — {d.due_on} (أدخلها: {d.entered_by})</span>
                      <DeadlineBadge state={deadlineState(d.due_on, today, d.done)} /> {d.done && <Badge>منجزة</Badge>}
                      <form action={setLegalDeadlineDone}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="done" value={d.done ? "0" : "1"} /><button className="text-xs underline">{d.done ? "إعادة فتح" : "تمّت"}</button></form></li>)}</ul>}
                    <form action={addLegalDeadline} className="grid gap-2 sm:grid-cols-4"><input type="hidden" name="matter" value={r.id} />
                      <input name="label" required maxLength={300} placeholder="المهلة (مثال: مهلة الاستئناف)" aria-label="المهلة" className={`${field} sm:col-span-2`} /><input type="date" name="due" required aria-label="تاريخ الاستحقاق" className={field} />
                      <input name="entered_by" required maxLength={200} defaultValue={r.lawyer ?? ""} placeholder="اسم المحامي" aria-label="المحامي" className={field} /><button className={`${small} sm:col-span-4`}>إضافة مهلة</button></form></div>
                  <form action={updateLegal} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={r.id} />
                    <label className={lbl}>الحالة<select name="status" defaultValue={r.status} className={field}>{Object.entries(LEGAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label className={lbl}>المحامي<input name="lawyer" defaultValue={r.lawyer ?? ""} maxLength={200} className={field} /></label>
                    <label className={lbl}>الجلسة القادمة<input type="date" name="next_hearing" defaultValue={r.next_hearing_on ?? ""} className={field} /></label>
                    <label className={lbl}>تاريخ صدور الحكم<input type="date" name="judgment_on" defaultValue={r.judgment_on ?? ""} className={field} /></label>
                    <label className={`${lbl} sm:col-span-2`}>النتيجة / الملخص<textarea name="outcome" rows={2} maxLength={3000} defaultValue={r.outcome ?? ""} className={area} /></label>
                    <button className={`${submit} sm:col-span-2`}>حفظ</button></form>
                  <Refs refs={refs.rows.filter((x) => x.entity_id === r.id)} entity="legal_matter" id={r.id} back={BASE} />
                </div></details>
            </li>); })}
        </ul>)}
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold text-primary">ملف قانوني جديد</summary>
        <form action={addLegal} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={lbl}>النوع<select name="kind" className={field}>{Object.entries(LEGAL_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={`${lbl} sm:col-span-2`}>العنوان<input name="title" required maxLength={500} className={field} /></label>
          <label className={lbl}>رقم الملف / الأساس<input name="ref_no" maxLength={100} className={field} /></label>
          <label className={lbl}>المحكمة / الجهة<input name="court" maxLength={300} className={field} /></label>
          <label className={lbl}>الخصم / الطرف المقابل<input name="opposing" maxLength={300} className={field} /></label>
          <label className={lbl}>المحامي<input name="lawyer" maxLength={200} className={field} /></label>
          <label className={lbl}>تاريخ الفتح<input type="date" name="opened_on" className={field} /></label>
          <label className={lbl}>تاريخ الحكم (إن وُجد)<input type="date" name="judgment_on" className={field} /></label>
          <label className={`${lbl} sm:col-span-3`}>ملاحظات<textarea name="notes" rows={2} maxLength={5000} className={area} /></label>
          <p className="text-xs text-muted-foreground sm:col-span-3">لا تُحتسب مهل الاستئناف أو التقادم تلقائيًا: يُدخلها المحامي بعد إضافة الملف، ويُسجَّل اسمه معها.</p>
          <button className={`${submit} sm:col-span-3`}>تسجيل الملف</button></form></details>
    </Shell>
  );
}
