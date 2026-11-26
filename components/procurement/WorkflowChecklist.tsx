import { CHECK_STATUSES, CHECK_STATUS_LABEL, type ChecklistRow, type CheckStatus } from "@/lib/procurementWorkflow";
import { setCheck } from "@/app/staff/procurement/file/[planItemId]/actions";

const fld = "min-h-12 rounded-xl border-2 bg-background px-2";
const TONE: Record<CheckStatus, string> = {
  complete: "border-green-300 bg-green-50 text-green-900", needs_completion: "border-amber-300 bg-amber-50 text-amber-950", awaiting_approval: "border-blue-300 bg-blue-50 text-blue-950",
  not_yet_due: "border-border bg-muted text-muted-foreground", overdue: "border-destructive/50 bg-red-50 text-red-900", not_applicable: "border-border bg-muted text-muted-foreground", needs_legal_review: "border-purple-300 bg-purple-50 text-purple-950",
};

/** Dynamic checklist: one row per stage of THIS file's method. «مكتمل» is only accepted together with an evidence reference (enforced again in the database). */
export default function WorkflowChecklist({ itemId, rows, editable }: { itemId: string; rows: ChecklistRow[]; editable: boolean }) {
  return (
    <ol className="space-y-3">{rows.map((r) => (
      <li key={r.stage.key} className={`space-y-2 rounded-2xl border p-3 ${r.isCurrent ? "border-primary border-2" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <b>{r.stage.label_ar}</b>
          {r.isCurrent && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">المرحلة الحالية</span>}
          <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[r.status]}`}>{r.label}</span>
          {!r.stage.required && <span className="text-xs text-muted-foreground">اختيارية</span>}
          {r.stage.conditional_on && <span className="text-xs text-muted-foreground">شرطها: {r.stage.conditional_on}</span>}
          {r.needsLegalReview && <span className="text-xs text-muted-foreground">(المرحلة بانتظار المراجعة القانونية)</span>}
        </div>
        {r.evidence && <p className="text-sm">الإثبات: {r.evidence}</p>}
        {r.note && <p className="text-sm text-muted-foreground">ملاحظة: {r.note}</p>}
        {r.due_on && <p className="text-sm text-muted-foreground">تاريخ مستهدف أدخله المستخدم: {r.due_on}</p>}
        {editable && <details><summary className="cursor-pointer text-sm font-bold text-primary">تحديث الحالة</summary>
          <form action={setCheck} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="item" value={itemId} /><input type="hidden" name="stage" value={r.stage.key} />
            <label className="text-sm">الحالة<select name="status" defaultValue={r.status === "overdue" ? "needs_completion" : r.status} className={`${fld} block w-full`}>{CHECK_STATUSES.filter((s) => s !== "overdue").map((s) => <option key={s} value={s}>{CHECK_STATUS_LABEL[s]}</option>)}</select></label>
            <label className="text-sm">الإثبات (مطلوب للإكمال: اسم مستند/رقم/رابط)<input name="evidence" maxLength={1000} defaultValue={r.evidence ?? ""} className={`${fld} block w-full`} /></label>
            <label className="text-sm">ملاحظة (مطلوبة لـ«غير منطبق»)<input name="note" maxLength={1000} defaultValue={r.note ?? ""} className={`${fld} block w-full`} /></label>
            <label className="text-sm">تاريخ مستهدف (اختياري)<input type="date" name="due" defaultValue={r.due_on ?? ""} className={`${fld} block w-full`} /></label>
            <button className="min-h-12 rounded-xl border px-4 text-sm font-semibold active:bg-muted sm:col-span-2">حفظ</button>
          </form></details>}
      </li>))}</ol>
  );
}
