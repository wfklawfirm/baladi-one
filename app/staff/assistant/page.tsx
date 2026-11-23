import { requireStaff } from "@/lib/supabase-server";
import { brainConfigured } from "@/lib/brain/rag";
import StaffHeader from "@/components/StaffHeader";
import Assistant from "@/components/brain/Assistant";

export const dynamic = "force-dynamic";
export const metadata = { title: "المساعد الذكي — BALADI ONE", referrer: "no-referrer" as const };
export default async function Page() {
  await requireStaff();
  return (
    <>
      <StaffHeader />
      <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">المساعد الذكي</h1><p className="text-sm text-muted-foreground">مبني على قاعدة القوانين والاجتهادات اللبنانية — يذكر النصوص والمصادر.</p>
        {brainConfigured() ? <Assistant /> : <p className="rounded-2xl border p-8 text-center text-muted-foreground">قريبًا — الأداة قيد التفعيل.</p>}
      </main>
    </>
  );
}
