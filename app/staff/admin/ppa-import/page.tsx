import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import ImportForm from "./form";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "استيراد نصوص هيئة الشراء العام — BALADI ONE", referrer: "no-referrer" as const, robots: { index: false } };

export default async function PpaImport() {
  const { sb } = await requireStaff();
  const { data: owner } = await sb.rpc("is_platform_owner");
  if (owner !== true) redirect("/staff");
  const { count } = await sb.from("procurement_doc").select("id", { count: "exact", head: true });
  return (
    <><StaffHeader back="/staff/admin" backLabel="الإدارة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">استيراد نصوص هيئة الشراء العام</h1>
      <p className="text-sm leading-6 text-muted-foreground">نصوص منشورة على موقع الهيئة (قانون 244/2021 ومراسيم وقرارات ومذكرات وأدلة). تُخزَّن كلها «قيد المراجعة»، وما قُرئ ضوئيًا منها قد تكون أرقامه خاطئة. المساعد يستعملها عند أسئلة الشراء.</p>
      <p className="rounded-xl bg-muted p-3 text-sm">المستندات المخزّنة حاليًا: <b>{count ?? 0}</b></p>
      <ImportForm />
    </main></>
  );
}
