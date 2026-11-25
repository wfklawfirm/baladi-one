import { addContract } from "@/app/staff/projects/actions";
import { supabaseServer } from "@/lib/supabase-server";
import { METHOD } from "@/lib/council";
import { BTN_PRIMARY, Explain, Field } from "@/components/simple/kit";
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 text-base outline-none focus:border-primary";

export default async function ContractForm({ project, projects }: { project?: string; projects?: { id: string; title: string }[] }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("municipal_decision").select("id,decision_no,year,title").in("legal_status", ["adopted", "under_review", "effective"]).order("created_at", { ascending: false }).limit(100);
  const decs = (data ?? []) as { id: string; decision_no: string; year: number; title: string }[];
  return (
    <form action={addContract} className="mt-3 space-y-4">
      {project && <input type="hidden" name="project" value={project} />}
      {!project && <Field label="المشروع" hint="اختياري: اربطوا العقد بمشروع إن وُجد."><select name="project" className={field}><option value="">غير مرتبط بمشروع</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>}
      <Field label="مع من العقد؟" required example="شركة الأمل للمقاولات"><input name="contractor" required maxLength={300} className={field} /></Field>
      <Field label="ما موضوع العقد؟" required example="تزفيت طريق الساحة"><input name="subject" required maxLength={1000} className={field} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="قيمة العقد" required example="25000"><input name="value" required inputMode="decimal" className={field} /></Field>
        <Field label="العملة"><select name="currency" className={field}><option value="USD">دولار</option><option value="LBP">ليرة لبنانية</option></select></Field>
      </div>
      <Field label="كيف اختيرَ المتعاقد؟" required hint="المناقصة العامة هي الأصل، وغيرها استثناء يحتاج تبريرًا."><select name="method" required defaultValue="" className={field}><option value="" disabled>اختر…</option>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Explain term="الاتفاق الرضائي">اختيار متعاقد مباشرة دون مناقصة. هو استثناء، ويلزم تبريره كتابةً وإبلاغ هيئة الشراء العام، وفق قانون الشراء العام 244/2021.</Explain>
      <Field label="سبب الاتفاق الرضائي" hint="إلزامي فقط إذا اخترتم الاتفاق الرضائي."><textarea name="justification" rows={2} maxLength={3000} className="w-full rounded-xl border-2 bg-background p-3 text-base outline-none focus:border-primary" /></Field>
      <details className="rounded-2xl border px-3 py-2"><summary className="cursor-pointer text-base font-semibold">حقول إضافية (تواريخ، ضمانة، قرار المجلس)</summary>
        <div className="space-y-3 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="يبدأ العقد في"><input type="date" name="start" className={field} /></Field>
            <Field label="ينتهي العقد في"><input type="date" name="end" className={field} /></Field>
          </div>
          <Field label="الضمانة" hint="المبلغ الذي يودعه المتعاقد ضمانًا للتنفيذ. اختياري."><input name="guarantee" inputMode="decimal" className={field} /></Field>
          <Field label="رقم المناقصة أو المنصة" hint="اختياري."><input name="tender_ref" maxLength={200} className={field} /></Field>
          <Field label="تاريخ نشر الإعلان"><input type="date" name="published" className={field} /></Field>
          <Field label="قرار المجلس البلدي المرتبط" hint="لا يُوقَّع العقد قبل ربطه بقرار المجلس، عدا استدراج الأسعار والفاتورة."><select name="decision" className={field}><option value="">غير مربوط</option>{decs.map((d) => <option key={d.id} value={d.id}>{d.decision_no}/{d.year} — {d.title}</option>)}</select></Field>
          <Field label="ملاحظات"><textarea name="notes" rows={2} maxLength={5000} className="w-full rounded-xl border-2 bg-background p-3 text-base outline-none focus:border-primary" /></Field>
        </div></details>
      <p className="text-sm leading-7 text-muted-foreground">يُسجَّل العقد «مسودة» أولًا. لا يصبح «موقَّعًا» قبل ربطه بقرار المجلس وقبل انقضاء مهلة التريّث بعد إشعار الترسية. النظام لا يقرر عنكم؛ الجهة المختصة تتحقق من الصلاحيات والعتبات.</p>
      <button className={BTN_PRIMARY}>تسجيل العقد</button>
    </form>
  );
}
