import { createDecision } from "@/app/staff/council/actions";
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default function DecisionForm({ session }: { session?: string }) {
  return (
    <form action={createDecision} className="mt-3 grid gap-3 sm:grid-cols-3">
      {session && <input type="hidden" name="session" value={session} />}
      <label className="space-y-1 text-sm font-medium sm:col-span-3">عنوان القرار<input name="title" required maxLength={300} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">رقم القرار<input name="no" required maxLength={40} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">السنة<input name="year" required inputMode="numeric" defaultValue={new Date().getFullYear()} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">تاريخ اتخاذه<input type="date" name="decided_on" className={field} /></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-3">نص القرار<textarea name="body" rows={4} maxLength={60000} className="w-full rounded-xl border-2 bg-background p-3 leading-7 outline-none focus:border-primary" /></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-3">الأساس القانوني (كما يرد في القرار)<input name="basis" maxLength={2000} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">أصوات مع<input name="vf" inputMode="numeric" className={field} /></label>
      <label className="space-y-1 text-sm font-medium">أصوات ضد<input name="va" inputMode="numeric" className={field} /></label>
      <label className="space-y-1 text-sm font-medium">امتناع<input name="vb" inputMode="numeric" className={field} /></label>
      <label className="space-y-1 text-sm font-medium">الجهة الرقابية المختصة<input name="authority" maxLength={200} className={field} /></label>
      <label className="space-y-1 text-sm font-medium">موعد التنفيذ المتوقع<input type="date" name="due" className={field} /></label>
      <label className="space-y-1 text-sm font-medium">المسؤول عن التنفيذ<input name="responsible" maxLength={200} className={field} /></label>
      <p className="text-xs text-muted-foreground sm:col-span-3">يُسجَّل القرار «مسودة» وحالة التنفيذ «لم يبدأ». النفاذ لا يُحتسب تلقائيًا: يُحدَّد لاحقًا بتاريخ من المستند الرسمي.</p>
      <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 sm:col-span-3">تسجيل القرار</button>
    </form>
  );
}
