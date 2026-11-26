import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { buildAuditPack, type Variant } from "@/lib/procurementAudit";
import { loadAuditInput } from "@/lib/procurementAuditData";
import AuditPackView from "@/components/procurement/AuditPackView";
import AuditPackPrint from "@/components/procurement/AuditPackPrint";

export const dynamic = "force-dynamic";
export const metadata = { title: "الملف الرقابي — BALADI ONE", referrer: "no-referrer" as const };

/** Read-only audit file for one plan item. Everything is read through the caller's RLS; nothing is written. */
export default async function AuditPackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { id } = await params, sp = await searchParams;
  const variant: Variant = sp.v === "shareable" ? "shareable" : "internal";
  const input = await loadAuditInput(sb, id, variant, memberships[0]?.municipality?.name_ar ?? "—");
  if (!input) notFound();
  const pack = buildAuditPack(input);
  const other = variant === "internal" ? "shareable" : "internal";
  return (
    <>
      <div className="print:hidden"><StaffHeader back="/staff/procurement/audit-pack" backLabel="الملفات الرقابية" /></div>
      <main className="space-y-4 p-4 md:p-8 print:p-0">
        <div dir="rtl" className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 print:hidden">
          <AuditPackPrint />
          <Link href={`/staff/procurement/audit-pack/${id}?v=${other}`} className="flex min-h-12 items-center rounded-xl border px-4 text-sm font-semibold active:bg-muted">{other === "shareable" ? "عرض النسخة القابلة للمشاركة" : "عرض النسخة الداخلية"}</Link>
          <p className="text-sm text-muted-foreground">للحفظ بصيغة PDF اختر «حفظ كـ PDF» من نافذة الطباعة. {variant === "internal" && "النسخة الداخلية تحوي الأسعار وتصاريح التعارض؛ لا تُشارَك خارج الجهة."}</p>
        </div>
        <AuditPackView pack={pack} />
      </main>
    </>
  );
}
