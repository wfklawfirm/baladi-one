import { requireStaff } from "@/lib/supabase-server";
import { brainConfigured } from "@/lib/brain/rag";
import StaffHeader from "@/components/StaffHeader";
import Analyzer from "@/components/brain/Analyzer";

export const dynamic = "force-dynamic";
export const metadata = { title: "قراءة المعاملة — BALADI ONE", referrer: "no-referrer" as const };
export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const t = ((await searchParams).t ?? "").slice(0, 1500);
  await requireStaff();
  return (
    <>
      <StaffHeader />
      <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">قراءة المعاملة</h1><p className="text-sm text-muted-foreground">ارفع المعاملة أو الصق نصها: تشخيص قانوني، مهل، مستندات، وخيارات قرار جاهزة للتوقيع.</p>
        {brainConfigured() ? <Analyzer initialText={t} /> : <p className="rounded-2xl border p-8 text-center text-muted-foreground">قريبًا — الأداة قيد التفعيل.</p>}
      </main>
    </>
  );
}
