import { addContract } from "@/app/staff/projects/actions";
import { supabaseServer } from "@/lib/supabase-server";
import { METHOD } from "@/lib/council";
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default async function ContractForm({ project, projects }: { project?: string; projects?: { id: string; title: string }[] }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("municipal_decision").select("id,decision_no,year,title").in("legal_status", ["adopted", "under_review", "effective"]).order("created_at", { ascending: false }).limit(100);
  const decs = (data ?? []) as { id: string; decision_no: string; year: number; title: string }[];
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
      <label className="space-y-1 text-sm font-medium">الكفالة (اختياري)<input name="guarantee" inputMode="decimal" className={field} /></label>
      <label className="space-y-1 text-sm font-medium">أسلوب التلزيم (قانون الشراء العام 244/2021)<select name="method" required defaultValue="" className={field}><option value="" disabled>اختر…</option>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="space-y-1 text-sm font-medium">مرجع المناقصة / رقم المنصة<input name="tender_ref" maxLength={200} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">تاريخ نشر الإعلان<input type="date" name="published" className={field} /></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-3">قرار المجلس البلدي<select name="decision" className={field}><option value="">غير مربوط</option>{decs.map((d) => <option key={d.id} value={d.id}>{d.decision_no}/{d.year} — {d.title}</option>)}</select></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-3">تبرير الاتفاق الرضائي (إلزامي عند اختياره)<textarea name="justification" rows={2} maxLength={3000} className="w-full rounded-xl border-2 bg-background p-3 outline-none focus:border-primary" /></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-3">ملاحظات<textarea name="notes" rows={2} maxLength={5000} className="w-full rounded-xl border-2 bg-background p-3 outline-none focus:border-primary" /></label>
      <p className="text-xs leading-6 text-muted-foreground sm:col-span-3">المناقصة العامة هي الأصل، والاتفاق الرضائي استثناء بتبرير. يُسجَّل العقد «مسودة»، ولا يُسجَّل «موقَّعًا» قبل ربطه بقرار المجلس (عدا استدراج الأسعار والفاتورة)، وقبل انقضاء مهلة التريّث بعد إشعار الترسية. النظام لا يُصدر أي استنتاج قانوني ولا يُرسّي شيئًا تلقائيًا؛ الصلاحيات والعتبات تحدّدها النصوص النافذة وتعديلاتها وتتحقق منها الجهة المختصة.</p>
      <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 sm:col-span-3">تسجيل العقد</button>
    </form>
  );
}
