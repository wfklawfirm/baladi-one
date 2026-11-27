import Link from "next/link";
import { LayoutGrid, Sparkles } from "lucide-react";
import { registerTrial } from "./actions";
import { readTrial } from "@/lib/trialServer";
import { TRIAL_DAYS, TRIAL_ERR } from "@/lib/trial";
import { LOGO_SRC } from "@/lib/brand-motion";

export const dynamic = "force-dynamic";
export const metadata = { title: "جرّب منصة بلدي الذكية — AIJUR", robots: { index: false } };
const fld = "min-h-12 w-full rounded-xl border-2 bg-background px-3 text-base outline-none focus:border-primary";

export default async function Try({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const t = await readTrial();
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-xl space-y-5 p-4 pb-16 pt-8">
      <header className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt="AIJUR" width={140} height={128} className="h-24 w-auto" />
        <h1 className="text-2xl font-bold">جرّب منصة بلدي الذكية</h1>
        <p className="text-base leading-7 text-muted-foreground">منصة بلدية متكاملة بالعربية من AIJUR. تصفّحوا المنصة مباشرة، وجرّبوا المساعد الذكي مجانًا {TRIAL_DAYS} أيام.</p>
      </header>
      <Link href="/" className="elev elev-hover flex items-center gap-3 rounded-2xl border bg-background p-4 active:bg-muted">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-primary"><LayoutGrid className="size-6" aria-hidden /></span>
        <span><b className="block text-lg">تصفّح المنصة الكاملة</b><span className="text-sm text-muted-foreground">الخدمات والمعاملات البلدية — بدون تسجيل</span></span>
      </Link>
      <section className="elev space-y-4 rounded-2xl border bg-background p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-6" aria-hidden /></span>
          <div><h2 className="text-lg font-bold">المساعد الذكي — تجربة {TRIAL_DAYS} أيام</h2><p className="text-sm text-muted-foreground">يجيب عن أسئلة الإدارة البلدية والقانون اللبناني، ويقترح مسودات فقط.</p></div>
        </div>
        {sp.err && TRIAL_ERR[sp.err] && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{TRIAL_ERR[sp.err]}</p>}
        {t.status === "ok" ? (
          <Link href="/try/assistant" className="grid min-h-12 place-items-center rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground">متابعة التجربة</Link>
        ) : (
          <form action={registerTrial} className="space-y-3">
            <label className="block space-y-1 text-base font-semibold">الاسم (اختياري)<input name="name" maxLength={120} autoComplete="name" className={fld} /></label>
            <label className="block space-y-1 text-base font-semibold">رقم الهاتف *<input name="phone" required inputMode="tel" autoComplete="tel" dir="ltr" placeholder="+961 71 123 456" className={fld} /></label>
            <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" name="consent" required className="mt-1.5 size-5 shrink-0" /><span>أوافق على حفظ رقم هاتفي لدى AIJUR للتواصل معي بخصوص التجربة، ولا يُستعمل لغير ذلك.</span></label>
            <button className="min-h-12 w-full rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground active:opacity-90">ابدأ التجربة المجانية</button>
          </form>
        )}
        <p className="text-xs leading-5 text-muted-foreground">المساعد يقترح ويصوغ مسودات فقط؛ لا يعتمد قرارًا ولا ينفّذ إجراءً. راجعوا المصادر والنص الرسمي قبل أي اعتماد.</p>
      </section>
    </main>
  );
}
