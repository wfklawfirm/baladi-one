import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { corpus } from "@/lib/brain/corpus";
import StaffHeader from "@/components/StaffHeader";
import Ingest from "@/components/brain/Ingest";

export const dynamic = "force-dynamic";
export default async function Page() {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "admin")) redirect("/staff");
  const { data } = await sb.rpc("admin_law_chunk_count");
  const total = corpus().length;
  return (<><StaffHeader /><main dir="rtl" lang="ar" className="mx-auto max-w-xl space-y-4 px-4 py-6"><h1 className="text-2xl font-bold">قاعدة معرفة الذكاء</h1><p className="text-sm text-muted-foreground">تحميل مكتبة القوانين والمعاملات والكتب المرجعية إلى البحث الذكي. يستغرق دقائق، ويمكن إيقافه واستئنافه. أبقِ الصفحة مفتوحة.</p><Ingest done={Number(data ?? 0)} total={total} /></main></>);
}
