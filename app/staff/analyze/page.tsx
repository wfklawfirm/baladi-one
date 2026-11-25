import { requireStaff } from "@/lib/supabase-server";
import { brainConfigured } from "@/lib/brain/rag";
import StaffHeader from "@/components/StaffHeader";
import { Intro, Empty } from "@/components/simple/kit";
import Analyzer from "@/components/brain/Analyzer";

export const dynamic = "force-dynamic";
export const metadata = { title: "قراءة المعاملة — BALADI ONE", referrer: "no-referrer" as const };
export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const t = ((await searchParams).t ?? "").slice(0, 1500);
  await requireStaff();
  return (
    <>
      <StaffHeader />
      <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 px-4 py-6 lg:max-w-7xl">
        <Intro title="اقرأ لي هذه المعاملة">الصق نص المعاملة أو أرفقها، وسنخبرك هل هي سليمة، وما الأوراق الناقصة، وما القرار الذي يمكنك توقيعه.</Intro>
        {brainConfigured() ? <Analyzer initialText={t} /> : <Empty>هذه الأداة لم تُفعَّل بعد. سنخبرك عند جاهزيتها.</Empty>}
      </main>
    </>
  );
}
