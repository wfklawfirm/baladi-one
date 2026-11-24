import { addContract } from "@/app/staff/projects/actions";
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default function ContractForm({ project, projects }: { project?: string; projects?: { id: string; title: string }[] }) {
  return (
    <form action={addContract} className="mt-3 grid gap-3 sm:grid-cols-3">
      {project && <input type="hidden" name="project" value={project} />}
      {!project && <label className="space-y-1 text-sm font-medium sm:col-span-3">المشروع (اختياري)<select name="project" className={field}><option value="">غير مرتبط بمشروع</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
      <label className="space-y-1 text-sm font-medium sm:col-span-2">المتعهد / المتعاقد<input name="contractor" required maxLength={300} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">القيمة<input name="value" required inputMode="decimal" className={field} /></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-2">موضوع العقد<input name="subject" required maxLength={1000} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">العملة<select name="currency" className={field}><option value="USD">دولار</option><option value="LBP">ليرة لبنانية</option></select></label>
      <label className="space-y-1 text-sm font-medium">بداية العقد<input type="date" name="start" className={field} /></label>
      <label className="space-y-1 text-sm font-medium">نهاية العقد<input type="date" name="end" className={field} /></label>
      <label className="space-y-1 text-sm font-medium">أسلوب التلزيم (كما في الملف الرسمي)<input name="procurement" maxLength={300} className={field} /></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-3">ملاحظات<textarea name="notes" rows={2} maxLength={5000} className="w-full rounded-xl border-2 bg-background p-3 outline-none focus:border-primary" /></label>
      <p className="text-xs text-muted-foreground sm:col-span-3">يُسجَّل العقد «مسودة». لا يُرسّى أو يُعتمد أي عقد تلقائيًا؛ تُغيَّر حالته يدويًا بعد استكمال الإجراءات الرسمية. التحقق من أصول التلزيم مسؤولية الجهة المختصة.</p>
      <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 sm:col-span-3">تسجيل العقد</button>
    </form>
  );
}
