import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import golden from "@/data/assistant_golden.json";
import EvalRunner from "./runner";

export const dynamic = "force-dynamic";
export const metadata = { title: "اختبار المساعد — BALADI ONE", referrer: "no-referrer" as const, robots: { index: false } };

export default async function AssistantEval() {
  const { sb } = await requireStaff();
  const { data: owner } = await sb.rpc("is_platform_owner");
  if (owner !== true) redirect("/staff");
  return (
    <><StaffHeader back="/staff/admin" backLabel="الإدارة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">اختبار المساعد الذكي</h1>
      <p className="text-sm leading-6 text-muted-foreground">يشغّل الأسئلة أدناه عبر المساعد الفعلي (المسار نفسه الذي يستعمله الموظفون) ويفحص الصياغة آليًا. <b>النجاح لا يعني صحة الجواب قانونيًا</b>؛ اقرأ كل جواب. أي خطأ تكتشفه: أرسله ليُضاف كحالة اختبار دائمة.</p>
      <EvalRunner cases={golden.cases} />
    </main></>
  );
}
