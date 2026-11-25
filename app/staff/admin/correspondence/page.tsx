import { Shell, Badge, Chips, DeadlineBadge, Refs, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
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
    <Shell title="المراسلات" sub="سجل الوارد والصادر؛ الترقيم مستقل لكل اتجاه ولكل سنة." err={sp.err} missing={list.missing}>
      <form className="flex flex-wrap gap-2">{sp.d && <input type="hidden" name="d" value={sp.d} />}{sp.s && <input type="hidden" name="s" value={sp.s} />}{sp.a && <input type="hidden" name="a" value={sp.a} />}
        <input name="q" defaultValue={sp.q} placeholder="بحث بالموضوع أو الجهة أو المحال إليه" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>بحث</button></form>
      <Chips items={[{ href: q({ d: undefined }), on: !sp.d, label: "الكل" }, ...Object.entries(DIRECTION).map(([k, v]) => ({ href: q({ d: k }), on: sp.d === k, label: v })), { href: q({ a: sp.a === "1" ? undefined : "1" }), on: sp.a === "1", label: "الأرشيف" }]} />
      <Chips items={[{ href: q({ s: undefined }), on: !sp.s, label: "كل الحالات" }, ...Object.entries(CORR_STATUS).map(([k, v]) => ({ href: q({ s: k }), on: sp.s === k, label: v }))]} />
      <p className="text-sm text-muted-foreground">{rows.length} مراسلة</p>
      {rows.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا مراسلات مطابقة.</p> : (
        <ul className="fill-odd grid gap-3 lg:grid-cols-2">
          {rows.map((r) => { const rp = r.reply_to ? byId.get(r.reply_to) : null; const st = deadlineState(r.deadline_on, today, fin(r.status)); return (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ok">{corrNumber(r.direction, r.seq, r.year)}</Badge><Badge>{CORR_STATUS[r.status]}</Badge><DeadlineBadge state={st} due={r.deadline_on} />{r.archived && <Badge>مؤرشف</Badge>}</div>
              <b className="block text-base text-primary">{r.subject}</b>
              <p className="text-xs text-muted-foreground">{[`${r.direction === "in" ? "من" : "إلى"}: ${r.party}`, `التاريخ ${r.doc_date}`, r.referred_to ? `محال إلى: ${r.referred_to}` : null, rp ? `ردّ على: ${corrNumber(rp.direction, rp.seq, rp.year)}` : null].filter(Boolean).join(" · ")}</p>
              {r.notes && <p className="whitespace-pre-line text-xs">{r.notes}</p>}
              <details><summary className="cursor-pointer text-sm font-bold text-primary">متابعة وإحالة</summary>
                <form action={updateCorrespondence} className="mt-2 grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={r.id} />
                  <label className={lbl}>الحالة<select name="status" defaultValue={r.status} className={field}>{Object.entries(CORR_STATUS).filter(([k]) => (r.direction === "in" ? k !== "sent" : ["sent", "closed"].includes(k))).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className={lbl}>الإحالة إلى (موظف/دائرة)<input name="referred_to" defaultValue={r.referred_to ?? ""} maxLength={200} className={field} /></label>
                  <label className={lbl}>موعد المتابعة<input type="date" name="deadline" defaultValue={r.deadline_on ?? ""} className={field} /></label>
                  <label className={lbl}>ملاحظة<input name="note" maxLength={1000} className={field} /></label>
                  <button className={`${submit} sm:col-span-2`}>حفظ</button></form>
                <form action={archiveCorrespondence} className="mt-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="archived" value={r.archived ? "0" : "1"} /><button className={small}>{r.archived ? "إلغاء الأرشفة" : "أرشفة"}</button></form>
                <div className="mt-2"><Refs refs={refs.rows.filter((x) => x.entity_id === r.id)} entity="correspondence" id={r.id} back={BASE} /></div>
              </details>
            </li>); })}
        </ul>)}
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold text-primary">تسجيل مراسلة جديدة</summary>
        <form action={addCorrespondence} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={lbl}>الاتجاه<select name="direction" className={field}>{Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={lbl}>تاريخ المعاملة<input type="date" name="doc_date" defaultValue={today} className={field} /></label>
          <label className={lbl}>موعد المتابعة (اختياري)<input type="date" name="deadline" className={field} /></label>
          <label className={`${lbl} sm:col-span-3`}>الموضوع<input name="subject" required maxLength={500} className={field} /></label>
          <label className={lbl}>الجهة (مرسِل / مرسَل إليه)<input name="party" required maxLength={300} className={field} /></label>
          <label className={lbl}>الإحالة إلى (اختياري)<input name="referred_to" maxLength={200} className={field} /></label>
          <label className={lbl}>ردّ على مراسلة واردة<select name="reply_to" className={field}><option value="">غير مرتبط</option>{all.filter((r) => r.direction === "in").map((r) => <option key={r.id} value={r.id}>{corrNumber(r.direction, r.seq, r.year)} — {r.subject.slice(0, 50)}</option>)}</select></label>
          <label className={`${lbl} sm:col-span-3`}>ملاحظات<textarea name="notes" rows={2} maxLength={3000} className={area} /></label>
          <p className="text-xs text-muted-foreground sm:col-span-3">يُعطى الرقم تلقائيًا (التسلسل لكل اتجاه وسنة). تسجيل صادر مرتبط بوارد يضع الوارد «تم الرد».</p>
          <button className={`${submit} sm:col-span-3`}>تسجيل</button></form></details>
    </Shell>
  );
}
