import Link from "next/link";
import { redirect } from "next/navigation";
import { readTrial } from "@/lib/trialServer";
import Assistant from "@/components/brain/Assistant";
import { LOGO_SRC } from "@/lib/brand-motion";

export const dynamic = "force-dynamic";
export const metadata = { title: "المساعد الذكي — تجربة", robots: { index: false } };
const IDEAS = ["ما صلاحيات رئيس البلدية في هذه المسألة؟", "ما مهل الطعن بقرارات المجلس البلدي؟", "كيف أُدرج موضوعًا على جدول أعمال المجلس؟", "حضّر مسودة كتاب رسمي", "ما إجراءات رخص البناء في البلدية؟", "ما الأحكام المتعلقة بالأملاك العامة والخاصة للبلدية؟"];

export default async function TrialAssistant() {
  const t = await readTrial();
  if (t.status !== "ok") redirect(`/try?err=${t.status}`);
  const left = Math.max(0, Math.ceil((new Date(t.expiresAt!).getTime() - Date.now()) / 86_400_000));
  return (
    <main dir="rtl" lang="ar" className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-3 border-b pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt="AIJUR" width={56} height={51} className="h-12 w-auto" />
        <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">منصة بلدي الذكية — تجربة</p><h1 className="font-bold">المساعد الذكي</h1></div>
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-primary">يتبقى {left} {left === 1 ? "يوم" : "أيام"}</span>
        <Link href="/" className="text-sm font-semibold text-primary">المنصة</Link>
      </header>
      <div className="flex flex-1 flex-col"><Assistant ideas={IDEAS} endpoint="/api/brain/trial" compact /></div>
      <p className="text-[11px] leading-5 text-muted-foreground">يقترح المساعد ويصوغ المسودات فقط؛ لا يعتمد قرارًا ولا ينفّذ إجراءً. راجع المصادر قبل الاعتماد.</p>
    </main>
  );
}
