import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { safe, fld } from "@/components/projects/procurement/data";
import { ErrNotice, PendingNotice } from "@/components/projects/procurement/Notice";
import { addSupplier } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "الموردون — BALADI ONE", referrer: "no-referrer" as const };
type Sup = { id: string; name: string; legal_form: string | null; contact: string | null; registry_ref: string | null; docs_expire_on: string | null; notes: string | null };

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const sup = await safe<Sup>(sb.from("procurement_supplier").select("id,name,legal_form,contact,registry_ref,docs_expire_on,notes").order("name").limit(500));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  return (
    <><StaffHeader back="/staff/procurement" backLabel="الشراء العام" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">الموردون</h1>
      <p className="text-sm text-muted-foreground">سجل داخلي للمراجع فقط؛ ليس قائمة مغلقة ولا يقيّد المنافسة المشروعة.</p>
      <ErrNotice err={sp.err} />{sup.missing && <PendingNotice what="سجل الموردين" />}
      {sup.data.length === 0 ? <p className="text-sm text-muted-foreground">لا موردين مسجّلين بعد.</p> :
        <ul className="space-y-2">{sup.data.map((x) => (<li key={x.id} className="rounded-xl border p-3 text-sm"><b>{x.name}</b>{x.legal_form ? ` · ${x.legal_form}` : ""}
          <p className="text-muted-foreground">{[x.contact, x.registry_ref && `سجل: ${x.registry_ref}`].filter(Boolean).join(" · ") || "—"}</p>
          {x.docs_expire_on && <p className={x.docs_expire_on < today ? "font-bold text-destructive" : "text-muted-foreground"}>انتهاء المستندات: {x.docs_expire_on}{x.docs_expire_on < today ? " (منتهية)" : ""}</p>}</li>))}</ul>}
      <details className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold text-primary">مورّد جديد</summary>
        <form action={addSupplier} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">الاسم<input name="name" required maxLength={300} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">الصفة القانونية<input name="form" maxLength={100} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">رقم السجل<input name="registry" maxLength={100} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-2">بيانات الاتصال<input name="contact" maxLength={300} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">تاريخ انتهاء المستندات<input type="date" name="docs_expire" className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-2">ملاحظات<input name="notes" maxLength={1000} className={`${fld} w-full`} /></label>
          <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground sm:col-span-2">إضافة</button>
        </form></details>
    </main></>
  );
}
