import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/supabase-server";
import PrintButton from "@/components/decisions/PrintButton";
import DocHtml from "@/components/procurement/DocHtml";
import { uuidOk } from "@/lib/council";
import { loadDocInput } from "@/lib/procurementDocs/load";
import { generateDoc } from "@/lib/procurementDocs/generate";
import { isDocKey } from "@/lib/procurementDocs/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "مستند شراء (مسودة) — BALADI ONE", referrer: "no-referrer" as const };

export default async function Page({ params, searchParams }: { params: Promise<{ item: string; key: string }>; searchParams: Promise<{ bid?: string; rec?: string }> }) {
  const { item, key } = await params, sp = await searchParams;
  if (!uuidOk(item) || !isDocKey(key)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const bid = sp.bid && uuidOk(sp.bid) ? sp.bid : null;
  const input = await loadDocInput(sb, item, bid);
  if (!input) notFound();
  const doc = generateDoc(key, input);
  const back = `/staff/procurement/docs/${item}`;
  if (!doc.ok) return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-3 p-6">
      <h1 className="text-xl font-bold">تعذّر إنشاء المستند</h1>
      <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm leading-7">{doc.message}</p>
      <Link href={back} className="font-semibold text-primary underline">العودة إلى مستندات البند</Link>
    </main>);
  const q = bid ? `?bid=${bid}` : "";
  const dl = (fmt: string, label: string) => <form key={fmt} method="post" action={`/staff/procurement/docs/${item}/${key}/${fmt}${q}`}><button className="min-h-10 rounded-xl border bg-background px-4 py-2 font-semibold">{label}</button></form>;
  return (
    <div className="bg-neutral-100 p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center gap-2 text-sm" dir="rtl">
        <PrintButton />{dl("docx", "تنزيل Word")}{key === "bid_comparison" && dl("xlsx", "تنزيل Excel")}
        <Link href={back} className="min-h-10 rounded-xl border bg-background px-4 py-2">العودة</Link>
        {!sp.rec && <span className="text-amber-900">معاينة غير مسجَّلة: التسجيل يتم من زر «توليد وفتح».</span>}
      </div>
      <DocHtml doc={doc} recordId={sp.rec && uuidOk(sp.rec) ? sp.rec : null} />
    </div>
  );
}
