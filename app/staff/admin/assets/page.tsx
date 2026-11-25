import { Shell, Badge, Chips, DeadlineBadge, Refs, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
import { ASSET_DISPOSAL_WARNING, ASSET_KIND, ASSET_STATUS, LEGAL_CLASS, NEEDS_VERIFICATION, deadlineState, formatValue, loadList } from "@/lib/admin";
import { addAsset, addLease, addMaintenance, setAssetClass, setLeaseStatus, updateAsset } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الأملاك والأصول — BALADI ONE", referrer: "no-referrer" as const };
const BASE = "/staff/admin/assets";
const CUR = <><option value="USD">دولار</option><option value="LBP">ليرة لبنانية</option></>;

export default async function Assets({ searchParams }: { searchParams: Promise<{ k?: string; q?: string; err?: string }> }) {
  const { sb, today } = await guard();
  const sp = await searchParams;
  const [as, ls, mt, refs] = await Promise.all([
    loadList(sb, "asset", "id,kind,name,location_text,legal_class,legal_class_verified,legal_class_basis,value_amount,currency,acquired_on,status,notes", { col: "created_at" }),
    loadList(sb, "asset_lease", "id,asset_id,lessee,start_on,end_on,rent_amount,currency,status,notes", { col: "end_on" }, 2000),
    loadList(sb, "asset_maintenance", "id,asset_id,done_on,description,cost_amount,currency,next_due_on", { col: "done_on" }, 2000),
    loadList(sb, "admin_ref", "id,entity_id,title,ref", undefined, 2000),
  ]);
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = as.rows.filter((a) => (!sp.k || a.kind === sp.k) && (!needle || `${a.name} ${a.location_text ?? ""}`.toLowerCase().includes(needle)));
  const chip = (k?: string) => (k ? `${BASE}?k=${k}` : BASE);
  return (
    <Shell title="الأملاك والأصول" sub="سجل الأملاك البلدية: التصنيف والقيمة والإيجارات والصيانة والمراجع." err={sp.err} missing={as.missing}>
      <section aria-label="تنبيه التصرف بالأملاك" className="rounded-2xl border-2 border-primary/40 bg-accent p-4 text-sm leading-7 text-primary">
        <b className="block">{ASSET_DISPOSAL_WARNING}</b>
        هذا السجل للتوثيق والمتابعة فقط؛ لا يُنفِّذ ولا يُجيز أي بيع أو تأجير أو تخصيص أو تغيير صفة. تصنيف الملك (عام/خاص) حقل يدوي «{NEEDS_VERIFICATION}» لدى الجهة المختصة، ولا يمنع النظام أي إجراء بسببه.
      </section>
      <form className="flex flex-wrap gap-2">{sp.k && <input type="hidden" name="k" value={sp.k} />}<input name="q" defaultValue={sp.q} placeholder="بحث بالاسم أو الموقع" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>بحث</button></form>
      <Chips items={[{ href: chip(), on: !sp.k, label: "الكل" }, ...Object.entries(ASSET_KIND).map(([k, v]) => ({ href: chip(k), on: sp.k === k, label: v }))]} />
      <p className="text-sm text-muted-foreground">{rows.length} أصل</p>
      {rows.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا أصول مسجّلة.</p> : (
        <ul className="fill-odd grid gap-3 lg:grid-cols-2">
          {rows.map((a) => { const leases = ls.rows.filter((l) => l.asset_id === a.id), maint = mt.rows.filter((m) => m.asset_id === a.id); return (
            <li key={a.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ok">{ASSET_KIND[a.kind]}</Badge><Badge>{ASSET_STATUS[a.status]}</Badge>
                <Badge tone={a.legal_class_verified ? "ok" : "warn"}>{LEGAL_CLASS[a.legal_class]}{a.legal_class_verified ? " · محقَّق" : ` · ${NEEDS_VERIFICATION}`}</Badge></div>
              <b className="block text-base text-primary">{a.name}</b>
              <p className="text-xs text-muted-foreground">{[a.location_text, `القيمة: ${formatValue(a.value_amount, a.currency)}`, a.acquired_on ? `الاقتناء ${a.acquired_on}` : null].filter(Boolean).join(" · ")}</p>
              <details><summary className="cursor-pointer text-sm font-bold text-primary">التفاصيل والإدارة ({leases.length} إيجار · {maint.length} صيانة)</summary>
                <div className="mt-3 space-y-3">
                  <form action={updateAsset} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={a.id} />
                    <label className={lbl}>الاسم<input name="name" required defaultValue={a.name} maxLength={300} className={field} /></label>
                    <label className={lbl}>الموقع<input name="location" defaultValue={a.location_text ?? ""} maxLength={500} className={field} /></label>
                    <label className={lbl}>القيمة (اتركها فارغة إن كانت مجهولة)<input name="value" inputMode="decimal" defaultValue={a.value_amount ?? ""} className={field} /></label>
                    <label className={lbl}>العملة<select name="currency" defaultValue={a.currency} className={field}>{CUR}</select></label>
                    <label className={lbl}>الحالة<select name="status" defaultValue={a.status} className={field}>{Object.entries(ASSET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label className={lbl}>ملاحظات<input name="notes" defaultValue={a.notes ?? ""} maxLength={3000} className={field} /></label>
                    <button className={`${submit} sm:col-span-2`}>حفظ البيانات</button></form>
                  <form action={setAssetClass} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2"><input type="hidden" name="id" value={a.id} />
                    <b className="text-sm sm:col-span-2">التصنيف القانوني ({NEEDS_VERIFICATION})</b>
                    <label className={lbl}>التصنيف<select name="legal_class" defaultValue={a.legal_class} className={field}>{Object.entries(LEGAL_CLASS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label className={lbl}>السند (قرار / قيد / مستند)<input name="basis" defaultValue={a.legal_class_basis ?? ""} maxLength={1000} className={field} /></label>
                    <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="verified" defaultChecked={a.legal_class_verified} className="size-5" />تم التحقق من التصنيف لدى الجهة المختصة (يستلزم تسجيل السند)</label>
                    <button className={`${small} sm:col-span-2`}>حفظ التصنيف</button></form>
                  <div className="space-y-2 rounded-xl border p-3"><b className="text-sm">الإيجارات</b>
                    {leases.length === 0 ? <p className="text-xs text-muted-foreground">لا إيجارات.</p> : <ul className="space-y-1.5 text-sm">{leases.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2">
                      <span>{l.lessee} · {l.start_on ?? "—"} ← {l.end_on ?? "—"} · الإيجار {formatValue(l.rent_amount, l.currency)}</span><Badge>{l.status === "active" ? "ساري" : "منتهٍ"}</Badge>
                      <DeadlineBadge state={deadlineState(l.end_on, today, l.status === "ended", 60)} due={l.end_on} />
                      <form action={setLeaseStatus}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value={l.status === "active" ? "ended" : "active"} /><button className="text-xs underline">{l.status === "active" ? "إنهاء" : "إعادة تفعيل"}</button></form></li>)}</ul>}
                    <form action={addLease} className="grid gap-2 sm:grid-cols-3"><input type="hidden" name="asset" value={a.id} />
                      <input name="lessee" required maxLength={300} placeholder="المستأجر" aria-label="المستأجر" className={field} /><input type="date" name="start" aria-label="البداية" className={field} /><input type="date" name="end" aria-label="النهاية" className={field} />
                      <input name="rent" inputMode="decimal" placeholder="بدل الإيجار (اختياري)" aria-label="بدل الإيجار" className={field} /><select name="currency" aria-label="العملة" className={field}>{CUR}</select><button className={small}>إضافة إيجار</button></form></div>
                  <div className="space-y-2 rounded-xl border p-3"><b className="text-sm">سجل الصيانة</b>
                    {maint.length === 0 ? <p className="text-xs text-muted-foreground">لا صيانة مسجّلة.</p> : <ul className="space-y-1 text-sm">{maint.map((m) => <li key={m.id}>{m.done_on} — {m.description} · الكلفة {formatValue(m.cost_amount, m.currency)}{m.next_due_on ? ` · الصيانة القادمة ${m.next_due_on}` : ""}</li>)}</ul>}
                    <form action={addMaintenance} className="grid gap-2 sm:grid-cols-3"><input type="hidden" name="asset" value={a.id} />
                      <input type="date" name="done_on" required defaultValue={today} aria-label="تاريخ التنفيذ" className={field} /><input name="description" required maxLength={2000} placeholder="الوصف" aria-label="الوصف" className={`${field} sm:col-span-2`} />
                      <input name="cost" inputMode="decimal" placeholder="الكلفة (اختياري)" aria-label="الكلفة" className={field} /><select name="currency" aria-label="العملة" className={field}>{CUR}</select><input type="date" name="next_due" aria-label="الصيانة القادمة" className={field} />
                      <button className={`${small} sm:col-span-3`}>إضافة صيانة</button></form></div>
                  <Refs refs={refs.rows.filter((r) => r.entity_id === a.id)} entity="asset" id={a.id} back={BASE} />
                </div></details>
            </li>); })}
        </ul>)}
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold text-primary">تسجيل أصل جديد</summary>
        <form action={addAsset} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={lbl}>النوع<select name="kind" className={field}>{Object.entries(ASSET_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={`${lbl} sm:col-span-2`}>الاسم / الوصف<input name="name" required maxLength={300} className={field} /></label>
          <label className={`${lbl} sm:col-span-2`}>الموقع<input name="location" maxLength={500} className={field} /></label>
          <label className={lbl}>تاريخ الاقتناء<input type="date" name="acquired" className={field} /></label>
          <label className={lbl}>القيمة (اختياري)<input name="value" inputMode="decimal" className={field} /></label>
          <label className={lbl}>العملة<select name="currency" className={field}>{CUR}</select></label>
          <label className={lbl}>التصنيف القانوني ({NEEDS_VERIFICATION})<select name="legal_class" defaultValue="unclassified" className={field}>{Object.entries(LEGAL_CLASS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={`${lbl} sm:col-span-3`}>ملاحظات<textarea name="notes" rows={2} maxLength={3000} className={area} /></label>
          <p className="text-xs text-muted-foreground sm:col-span-3">القيمة المجهولة تبقى «غير مُدخل» ولا تُعرض صفرًا. يُسجَّل التصنيف غير محقَّق إلى أن يُحدَّد سنده.</p>
          <button className={`${submit} sm:col-span-3`}>تسجيل الأصل</button></form></details>
    </Shell>
  );
}
