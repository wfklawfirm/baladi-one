import { Shell, Badge, Chips, DeadlineBadge, Refs, AddNew, MoreFields, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
import { Empty, Field, StepCard } from "@/components/simple/kit";
import { CORR_STATUS, DIRECTION, corrNumber, deadlineState, loadList } from "@/lib/admin";
import { addCorrespondence, archiveCorrespondence, updateCorrespondence } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "المراسلات — BALADI ONE", referrer: "no-referrer" as const };
const BASE = "/staff/admin/correspondence";

export default async function Correspondence({ searchParams }: { searchParams: Promise<{ d?: string; s?: string; q?: string; a?: string; err?: string }> }) {
  const { sb, today } = await guard();
  const sp = await searchParams;
  const [list, refs] = await Promise.all([
    loadList(sb, "correspondence", "id,direction,year,seq,subject,party,doc_date,referred_to,deadline_on,status,reply_to,archived,archived_on,notes", { col: "created_at" }),
    loadList(sb, "admin_ref", "id,entity_id,title,ref", undefined, 2000),
  ]);
  const all = list.rows;
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = all.filter((r) => (sp.a === "1" ? r.archived : !r.archived) && (!sp.d || r.direction === sp.d) && (!sp.s || r.status === sp.s)
    && (!needle || `${r.subject} ${r.party} ${r.referred_to ?? ""}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.year - a.year || b.seq - a.seq);
  const q = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ d: sp.d, s: sp.s, a: sp.a, ...o })) if (v) p.set(k, v); const t = p.toString(); return t ? `${BASE}?${t}` : BASE; };
  const byId = new Map(all.map((r) => [r.id, r]));
  const fin = (s: string) => ["replied", "sent", "closed"].includes(s);
  return (
    <Shell title="المراسلات" sub="هنا تسجّلون كل كتاب يصل إلى البلدية (وارد) أو يخرج منها (صادر)، وتحيلونه لموظف وتتابعون الرد عليه. الرقم يُعطى تلقائيًا." err={sp.err} missing={list.missing}>
      <form className="flex flex-wrap gap-2">{sp.d && <input type="hidden" name="d" value={sp.d} />}{sp.s && <input type="hidden" name="s" value={sp.s} />}{sp.a && <input type="hidden" name="a" value={sp.a} />}
        <input name="q" defaultValue={sp.q} placeholder="ابحثوا بالموضوع أو اسم الجهة…" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>ابحث</button></form>
      <Chips items={[{ href: q({ d: undefined }), on: !sp.d, label: "الوارد والصادر" }, ...Object.entries(DIRECTION).map(([k, v]) => ({ href: q({ d: k }), on: sp.d === k, label: v })), { href: q({ a: sp.a === "1" ? undefined : "1" }), on: sp.a === "1", label: "المؤرشفة" }]} />
      <Chips items={[{ href: q({ s: undefined }), on: !sp.s, label: "كل الحالات" }, ...Object.entries(CORR_STATUS).map(([k, v]) => ({ href: q({ s: k }), on: sp.s === k, label: v }))]} />
      <p className="text-base text-muted-foreground">{rows.length} مراسلة</p>
      {rows.length === 0 ? <Empty>لا توجد مراسلات هنا بعد. اضغطوا «＋ أسجّل كتابًا جديدًا» في الأسفل.</Empty> : (
        <ul className="fill-odd grid gap-3 lg:grid-cols-2">
          {rows.map((r) => { const rp = r.reply_to ? byId.get(r.reply_to) : null; const st = deadlineState(r.deadline_on, today, fin(r.status)); return (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ok">{corrNumber(r.direction, r.seq, r.year)}</Badge><Badge>{CORR_STATUS[r.status]}</Badge><DeadlineBadge state={st} due={r.deadline_on} />{r.archived && <Badge>مؤرشف</Badge>}</div>
              <b className="block text-base text-primary">{r.subject}</b>
              <p className="text-sm text-muted-foreground">{[`${r.direction === "in" ? "من" : "إلى"}: ${r.party}`, `التاريخ ${r.doc_date}`, r.referred_to ? `محال إلى: ${r.referred_to}` : null, rp ? `ردّ على: ${corrNumber(rp.direction, rp.seq, rp.year)}` : null].filter(Boolean).join(" · ")}</p>
              {r.notes && <p className="whitespace-pre-line text-sm">{r.notes}</p>}
              <details><summary className="cursor-pointer text-sm font-bold text-primary">أتابع هذا الكتاب أو أحيله</summary>
                <form action={updateCorrespondence} className="mt-2 grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={r.id} />
                  <label className={lbl}>أين وصل الكتاب؟<select name="status" defaultValue={r.status} className={field}>{Object.entries(CORR_STATUS).filter(([k]) => (r.direction === "in" ? k !== "sent" : ["sent", "closed"].includes(k))).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className={lbl}>الإحالة إلى (موظف/دائرة)<input name="referred_to" defaultValue={r.referred_to ?? ""} maxLength={200} className={field} /></label>
                  <label className={lbl}>متى أتابعه؟<input type="date" name="deadline" defaultValue={r.deadline_on ?? ""} className={field} /></label>
                  <label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label>
                  <button className={`${submit} sm:col-span-2`}>احفظ المتابعة</button></form>
                <form action={archiveCorrespondence} className="mt-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="archived" value={r.archived ? "0" : "1"} /><button className={small}>{r.archived ? "أخرجه من الأرشيف" : "انقله إلى الأرشيف"}</button></form>
                <div className="mt-2"><Refs refs={refs.rows.filter((x) => x.entity_id === r.id)} entity="correspondence" id={r.id} back={BASE} /></div>
              </details>
            </li>); })}
        </ul>)}
      <AddNew title="أسجّل كتابًا جديدًا" intro="اتبعوا الخطوتين. الرقم والسنة يُعطيان تلقائيًا، فلا تكتبوهما.">
        <form action={addCorrespondence} className="space-y-4">
          <StepCard n={1} title="ما هذا الكتاب؟" hint="وارد = وصل إلى البلدية. صادر = خرج من البلدية.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نوعه"><select name="direction" className={field}>{Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="تاريخه"><input type="date" name="doc_date" defaultValue={today} className={field} /></Field>
              <div className="sm:col-span-2"><Field label="موضوعه" required example="طلب ترخيص بناء"><input name="subject" required maxLength={500} className={field} /></Field></div>
              <div className="sm:col-span-2"><Field label="من أو إلى من؟ (اسم الجهة)" required example="محافظة جبل لبنان"><input name="party" required maxLength={300} className={field} /></Field></div>
            </div>
          </StepCard>
          <StepCard n={2} title="خيارات إضافية" hint="يمكنكم تركها فارغة.">
            <MoreFields label="أفتح الخيارات">
              <Field label="أحيله إلى من؟"><input name="referred_to" maxLength={200} className={field} /></Field>
              <Field label="متى أتابعه؟"><input type="date" name="deadline" className={field} /></Field>
              <div className="sm:col-span-2"><Field label="هو ردّ على كتاب وارد؟" hint="إن اخترتم كتابًا، يصبح الوارد «تم الرد» تلقائيًا."><select name="reply_to" className={field}><option value="">لا، غير مرتبط</option>{all.filter((r) => r.direction === "in").map((r) => <option key={r.id} value={r.id}>{corrNumber(r.direction, r.seq, r.year)} — {r.subject.slice(0, 50)}</option>)}</select></Field></div>
              <div className="sm:col-span-2"><Field label="ملاحظات"><textarea name="notes" rows={2} maxLength={3000} className={area} /></Field></div>
            </MoreFields>
          </StepCard>
          <button className={`${submit} w-full sm:w-auto`}>سجّل الكتاب</button>
        </form>
      </AddNew>
    </Shell>
  );
}
