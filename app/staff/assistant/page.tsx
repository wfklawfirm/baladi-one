import { requireStaff } from "@/lib/supabase-server";
import { brainConfigured } from "@/lib/brain/rag";
import StaffHeader from "@/components/StaffHeader";
import { Intro, Empty } from "@/components/simple/kit";
import Assistant from "@/components/brain/Assistant";

export const dynamic = "force-dynamic";
export const metadata = { title: "المساعد الذكي — BALADI ONE", referrer: "no-referrer" as const };
export default async function Page() {
  await requireStaff();
  return (
    <>
      <StaffHeader />
      <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 px-4 py-6 lg:max-w-7xl">
        <Intro title="اسأل المساعد">اكتب أي سؤال عن عمل البلدية أو القانون بكلماتك العادية. يجيبك بلغة بسيطة، ويمكنك أن ترى مصدر الجواب.</Intro>
        {brainConfigured() ? <Assistant /> : <Empty>هذه الأداة لم تُفعَّل بعد. سنخبرك عند جاهزيتها.</Empty>}
      </main>
    </>
  );
}
