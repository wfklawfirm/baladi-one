import { Shell, Badge, Chips, DeadlineBadge, Refs, AddNew, MoreFields, area, field, guard, lbl, submit } from "@/components/admin/ui";
import { Empty, Explain, Field, StepCard } from "@/components/simple/kit";
import { OVERSIGHT_KIND, OVERSIGHT_STATUS, deadlineState, loadList } from "@/lib/admin";
import { addOversight, updateOversight } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الرقابة الإدارية — BALADI ONE", referrer: "no-referrer" as const };
const BASE = "/staff/admin/oversight";

export default async function Oversight({ searchParams }: { searchParams: Promise<{ k?: string; s?: string; q?: string; err?: string }> }) {
  const { sb, today } = await guard();
  const sp = await searchParams;
  const [it, refs] = await Promise.all([
    loadList(sb, "oversight_item", "id,kind,subject,authority,ref_no,responsible,received_on,due_on,response,status,closed_on,closure_evidence", { col: "created_at" }),
    loadList(sb, "admin_ref", "id,entity_id,title,ref", undefined, 2000),
  ]);
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = it.rows.filter((r) => (!sp.k || r.kind === sp.k) && (!sp.s || r.status === sp.s) && (!needle || `${r.subject} ${r.authority ?? ""} ${r.ref_no ?? ""}`.toLowerCase().includes(needle)));
  const q = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ k: sp.k, s: sp.s, ...o })) if (v) p.set(k, v); const t = p.toString(); return t ? `${BASE}?${t}` : BASE; };
  return (
    <Shell title="الرقابة الإدارية" sub="حين تكتب جهة رقابية إلى البلدية (ملاحظة أو طلب مستند)، تسجّلونها هنا وتردّون عليها في موعدها. لا يُغلق أي بند إلا بعد كتابة ما يثبت معالجته." err={sp.err} missing={it.missing}>
      <Chips items={[{ href: q({ k: undefined }), on: !sp.k, label: "كل الأنواع" }, ...Object.entries(OVERSIGHT_KIND).map(([k, v]) => ({ href: q({ k }), on: sp.k === k, label: v }))]} />
      <Chips items={[{ href: q({ s: undefined }), on: !sp.s, label: "كل الحالات" }, ...Object.entries(OVERSIGHT_STATUS).map(([k, v]) => ({ href: q({ s: k }), on: sp.s === k, label: v }))]} />
      <p className="text-base text-muted-foreground">{rows.length} بند</p>
      {rows.length === 0 ? <Empty>لا توجد كتب رقابية بعد. اضغطوا «＋ أسجّل كتابًا رقابيًا» في الأسفل.</Empty> : (
        <ul className="fill-odd grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ok">{OVERSIGHT_KIND[r.kind]}</Badge><Badge tone={r.status === "closed" ? "plain" : "warn"}>{OVERSIGHT_STATUS[r.status]}</Badge><DeadlineBadge state={deadlineState(r.due_on, today, r.status === "closed")} due={r.due_on} />{r.ref_no && <Badge>رقم {r.ref_no}</Badge>}</div>
              <b className="block text-base text-primary">{r.subject}</b>
              <p className="text-sm text-muted-foreground">{[r.authority ? `الجهة: ${r.authority}` : null, r.responsible ? `المسؤول: ${r.responsible}` : null, r.received_on ? `الاستلام ${r.received_on}` : null].filter(Boolean).join(" · ") || "—"}</p>
              {r.status === "closed" && <p className="whitespace-pre-line rounded-lg bg-muted p-2 text-sm"><b>دليل الإقفال ({r.closed_on}):</b> {r.closure_evidence}</p>}
              <details><summary className="cursor-pointer text-sm font-bold text-primary">أردّ أو أغلق هذا البند</summary>
                <form action={updateOversight} className="mt-2 grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={r.id} />
                  <label className={lbl}>أين وصل البند؟<select name="status" defaultValue={r.status} className={field}>{Object.entries(OVERSIGHT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className={lbl}>آخر موعد للرد<input type="date" name="due_on" defaultValue={r.due_on ?? ""} className={field} /></label>
                  <label className={`${lbl} sm:col-span-2`}>ماذا ردّت البلدية أو فعلت؟<textarea name="response" rows={2} maxLength={5000} defaultValue={r.response ?? ""} className={area} /></label>
                  <label className={`${lbl} sm:col-span-2`}>ما الذي يثبت إنجازه؟ (إلزامي لإغلاق البند)<textarea name="evidence" rows={2} maxLength={5000} defaultValue={r.closure_evidence ?? ""} className={area} /></label>
                  <label className={lbl}>تاريخ الإقفال<input type="date" name="closed_on" defaultValue={r.closed_on ?? ""} className={field} /></label>
                  <button className={`${submit} sm:col-span-2`}>احفظ</button></form>
                <div className="mt-2"><Refs refs={refs.rows.filter((x) => x.entity_id === r.id)} entity="oversight_item" id={r.id} back={BASE} /></div>
              </details>
            </li>))}
        </ul>)}
      <AddNew title="أسجّل كتابًا رقابيًا جديدًا" intro="اكتبوا ممّن وصل الكتاب وما موضوعه.">
        <form action={addOversight} className="space-y-4">
          <StepCard n={1} title="ما هذا الكتاب؟">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نوعه"><select name="kind" className={field}>{Object.entries(OVERSIGHT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="من أي جهة رقابية؟" example="التفتيش المركزي"><input name="authority" maxLength={300} className={field} /></Field>
              <div className="sm:col-span-2"><Field label="موضوعه" required example="طلب مستندات عن مناقصة الإنارة"><input name="subject" required maxLength={1000} className={field} /></Field></div>
            </div>
          </StepCard>
          <StepCard n={2} title="مواعيد ومسؤول (اختياري)">
            <MoreFields label="أفتح الخيارات">
              <Field label="تاريخ وصوله"><input type="date" name="received_on" defaultValue={today} className={field} /></Field>
              <Field label="آخر موعد للرد"><input type="date" name="due_on" className={field} /></Field>
              <Field label="رقم الكتاب"><input name="ref_no" maxLength={100} className={field} /></Field>
              <Field label="من سيعالجه؟"><input name="responsible" maxLength={200} className={field} /></Field>
            </MoreFields>
          </StepCard>
          <button className={`${submit} w-full sm:w-auto`}>سجّل الكتاب</button>
        </form>
      </AddNew>
    </Shell>
  );
}
