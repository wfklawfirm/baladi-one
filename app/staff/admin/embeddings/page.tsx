import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import EmbedRunner from "./EmbedRunner";

export const dynamic = "force-dynamic";
export const metadata = { title: "توليد فهرس البحث الدلالي — BALADI ONE", robots: { index: false } };

export default async function Embeddings() {
  const { sb } = await requireStaff();
  const { data: owner } = await sb.rpc("is_platform_owner");
  if (owner !== true) redirect("/staff");
  return (
    <><StaffHeader back="/staff/admin" backLabel="الإدارة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">توليد فهرس البحث الدلالي (Embeddings)</h1>
      <p className="text-sm leading-6 text-muted-foreground">يولّد الفهرس للنصوص القانونية الجديدة أو التي تغيّر نصها منذ آخر توليد. لا يغيّر أي نص قانوني ولا حالة الاعتماد؛ يكتب المتجهات فقط.</p>
      <EmbedRunner />
    </main></>
  );
}
