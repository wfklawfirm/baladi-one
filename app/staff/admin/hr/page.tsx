import { Shell, Badge, AddNew, MoreFields, area, field, guard, lbl, small, submit } from "@/components/admin/ui";
import { Empty, Field, StepCard } from "@/components/simple/kit";
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
    <Shell title="سجل الوظائف والتكليفات" sub="هنا تسجّلون من يعمل في البلدية وما منصبه وفي أي دائرة. لا رواتب ولا بيانات مالية في هذا السجل." err={sp.err} missing={hr.missing}>
      <form className="flex flex-wrap gap-2">{sp.all && <input type="hidden" name="all" value={sp.all} />}<input name="q" defaultValue={sp.q} placeholder="ابحثوا بالاسم أو المنصب…" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary" /><button className={small}>ابحث</button></form>
      <a href={sp.all === "1" ? "/staff/admin/hr" : "/staff/admin/hr?all=1"} className={`${small} inline-block`}>{sp.all === "1" ? "أعرض العاملين حاليًا فقط" : "أعرض من انتهى تكليفهم أيضًا"}</a>
      <p className="text-base text-muted-foreground">{rows.length} تكليف</p>
      {rows.length === 0 ? <Empty>لا يوجد موظفون مسجّلون بعد. اضغطوا «＋ أسجّل موظفًا» في الأسفل.</Empty> : (
        <ul className="fill-odd grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="elev space-y-2 rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={r.ended_on ? "plain" : "ok"}>{r.ended_on ? "منتهٍ" : "قائم"}</Badge>{r.unit && <Badge>{r.unit}</Badge>}</div>
              <b className="block text-base text-primary">{r.person_name} — {r.position_title}</b>
              <p className="text-sm text-muted-foreground">{[r.assigned_on ? `التكليف ${r.assigned_on}` : null, r.ended_on ? `الانتهاء ${r.ended_on}` : null].filter(Boolean).join(" · ") || "—"}</p>
              {r.notes && <p className="text-sm">{r.notes}</p>}
              {!r.ended_on && <details><summary className="cursor-pointer text-sm font-bold text-primary">أنهي عمل هذا الموظف</summary>
                <form action={endPosition} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={r.id} /><input type="date" name="ended_on" required defaultValue={today} aria-label="تاريخ الانتهاء" className={field} /><button className={small}>أنهِ التكليف</button></form></details>}
            </li>))}
        </ul>)}
      <AddNew title="أسجّل موظفًا أو تكليفًا جديدًا" intro="الاسم والمنصب كافيان؛ والباقي اختياري.">
        <form action={addPosition} className="space-y-4">
          <StepCard n={1} title="من هو وما عمله؟">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الاسم" required><input name="name" required maxLength={200} className={field} /></Field>
              <Field label="المنصب أو الوظيفة" required example="أمين الصندوق"><input name="position" required maxLength={200} className={field} /></Field>
            </div>
          </StepCard>
          <StepCard n={2} title="تفاصيل (اختياري)">
            <MoreFields label="أفتح الخيارات">
              <Field label="في أي دائرة؟"><input name="unit" maxLength={200} className={field} /></Field>
              <Field label="متى بدأ التكليف؟"><input type="date" name="assigned_on" className={field} /></Field>
              <div className="sm:col-span-2"><Field label="ملاحظات"><textarea name="notes" rows={2} maxLength={2000} className={area} /></Field></div>
            </MoreFields>
          </StepCard>
          <button className={`${submit} w-full sm:w-auto`}>سجّل التكليف</button>
        </form>
      </AddNew>
    </Shell>
  );
}
