import { Shell, Badge, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
import { loadList } from "@/lib/admin";
import { addPosition, endPosition } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل الوظائف والتكليفات — BALADI ONE", referrer: "no-referrer" as const };

export default async function Hr({ searchParams }: { searchParams: Promise<{ all?: string; q?: string; err?: string }> }) {
  const { sb, today } = await guard();
  const sp = await searchParams;
  const hr = await loadList(sb, "hr_position", "id,person_name,position_title,unit,assigned_on,ended_on,notes", { col: "created_at" });
  const needle = (sp.q ?? "").trim().toLowerCase();
  const rows = hr.rows.filter((r) => (sp.all === "1" || !r.ended_on) && (!needle || `${r.person_name} ${r.position_title} ${r.unit ?? ""}`.toLowerCase().includes(needle)));
  return (
    <Shell title="سجل الوظائف والتكليفات" sub="سجل بسيط للمنصب والوحدة وتاريخ التكليف. لا رواتب ولا بيانات مالية للموظفين في هذا السجل." err={sp.err} missing={hr.missing}>
      <form className="flex flex-wrap gap-2">{sp.all && <input type="hidden" name="all" value={sp.all} />}<input name="q" defaultValue={sp.q} placeholder="بحث بالاسم أو المنصب أو الوحدة" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>بحث</button></form>
      <a href={sp.all === "1" ? "/staff/admin/hr" : "/staff/admin/hr?all=1"} className={`${small} inline-block`}>{sp.all === "1" ? "إظهار القائم فقط" : "إظهار المنتهي أيضًا"}</a>
      <p className="text-sm text-muted-foreground">{rows.length} تكليف</p>
      {rows.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا تكليفات مسجّلة.</p> : (
        <ul className="fill-odd grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={r.ended_on ? "plain" : "ok"}>{r.ended_on ? "منتهٍ" : "قائم"}</Badge>{r.unit && <Badge>{r.unit}</Badge>}</div>
              <b className="block text-base text-primary">{r.person_name} — {r.position_title}</b>
              <p className="text-xs text-muted-foreground">{[r.assigned_on ? `التكليف ${r.assigned_on}` : null, r.ended_on ? `الانتهاء ${r.ended_on}` : null].filter(Boolean).join(" · ") || "—"}</p>
              {r.notes && <p className="text-xs">{r.notes}</p>}
              {!r.ended_on && <details><summary className="cursor-pointer text-sm font-bold text-primary">إنهاء التكليف</summary>
                <form action={endPosition} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={r.id} /><input type="date" name="ended_on" required defaultValue={today} aria-label="تاريخ الانتهاء" className={field} /><button className={small}>إنهاء</button></form></details>}
            </li>))}
        </ul>)}
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold text-primary">تكليف جديد</summary>
        <form action={addPosition} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={lbl}>الاسم<input name="name" required maxLength={200} className={field} /></label>
          <label className={lbl}>المنصب / الوظيفة<input name="position" required maxLength={200} className={field} /></label>
          <label className={lbl}>الوحدة / الدائرة<input name="unit" maxLength={200} className={field} /></label>
          <label className={lbl}>تاريخ التكليف<input type="date" name="assigned_on" className={field} /></label>
          <label className={`${lbl} sm:col-span-2`}>ملاحظات<textarea name="notes" rows={2} maxLength={2000} className={area} /></label>
          <button className={`${submit} sm:col-span-3`}>تسجيل</button></form></details>
    </Shell>
  );
}
