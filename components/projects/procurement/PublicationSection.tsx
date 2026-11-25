import { PUB_KIND, publicationComplete } from "@/lib/procurement";
import { addPublication } from "@/app/staff/projects/procurement/actions";
import { btn, fld } from "./data";
export type Publication = { id: string; kind: string; platform_url: string | null; reference_no: string | null; published_on: string | null; document_ref: string | null; proof_ref: string | null; notes: string | null };

export default function PublicationSection({ contractId, rows }: { contractId: string; rows: Publication[] }) {
  return (
    <section className="elev space-y-3 rounded-2xl border bg-background p-4">
      <h2 className="font-bold text-primary">سجل النشر الرسمي</h2>
      <p className="rounded-xl bg-amber-50 p-2 text-xs leading-6 text-amber-950">حفظ مستند داخل BALADI ONE ليس نشرًا رسميًا. يُعدّ النشر موثَّقًا فقط عند تسجيل رابط المنصة الرسمية والرقم المرجعي وتاريخ النشر وإثباته.</p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا سجل نشر رسمي.</p> : (
        <ul className="space-y-2 text-sm">{rows.map((p) => { const ok = publicationComplete(p); return (
          <li key={p.id} className="space-y-0.5 rounded-xl border p-3"><p className="font-bold">{PUB_KIND[p.kind]} <span className={`text-xs ${ok ? "text-green-700" : "text-destructive"}`}>{ok ? "✔ سجل مكتمل" : "✖ سجل ناقص (رابط/رقم/تاريخ/إثبات)"}</span></p>
            <p className="text-xs">المنصة: {p.platform_url ? <a href={p.platform_url} target="_blank" rel="noreferrer" className="text-primary underline">{p.platform_url}</a> : "—"} · الرقم المرجعي: {p.reference_no ?? "—"} · التاريخ: {p.published_on ?? "—"}</p>
            <p className="text-xs text-muted-foreground">المستند المنشور: {p.document_ref ?? "—"} · الإثبات: {p.proof_ref ?? "—"}</p></li>); })}</ul>)}
      <details><summary className="cursor-pointer text-sm font-bold text-primary">تسجيل نشر</summary>
        <form action={addPublication} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="contract" value={contractId} />
          <label className="text-xs">النوع<select name="kind" className={`${fld} block w-full`}>{Object.entries(PUB_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs sm:col-span-2">رابط المنصة الرسمية<input name="url" type="url" placeholder="https://" className={`${fld} block w-full`} /></label>
          <label className="text-xs">الرقم المرجعي<input name="ref" maxLength={200} className={`${fld} block w-full`} /></label>
          <label className="text-xs">تاريخ النشر<input type="date" name="published" className={`${fld} block w-full`} /></label>
          <label className="text-xs">المستند المنشور<input name="document" maxLength={1000} className={`${fld} block w-full`} /></label>
          <label className="text-xs sm:col-span-2">إثبات النشر (إيصال/لقطة/أرشيف)<input name="proof" maxLength={1000} className={`${fld} block w-full`} /></label>
          <label className="text-xs">ملاحظات<input name="notes" maxLength={2000} className={`${fld} block w-full`} /></label>
          <button className={`${btn} sm:col-span-3`}>حفظ</button></form></details>
    </section>
  );
}
