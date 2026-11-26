import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { safe, fld } from "@/components/projects/procurement/data";
import { PendingNotice } from "@/components/projects/procurement/Notice";
import ObjectionsList, { type Objection, type ObjectionReply } from "@/components/procurement/ObjectionsList";
import { uuidOk } from "@/lib/council";
import { procErr } from "@/lib/procurement";
import { OBJECTION_BANNER, OBJECTION_ERR } from "@/lib/procurementObjections";
import { addObjection } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "اعتراضات الشراء — BALADI ONE", referrer: "no-referrer" as const };

export default async function ObjectionsPage({ params, searchParams }: { params: Promise<{ planItemId: string }>; searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { planItemId: id } = await params, sp = await searchParams;
  if (!uuidOk(id)) notFound();
  const { data: item } = await sb.from("procurement_plan_item").select("id,title").eq("id", id).maybeSingle<{ id: string; title: string }>();
  if (!item) notFound();
  const [obj, rep] = await Promise.all([
    safe<Objection>(sb.from("procurement_objection").select("id,objector,subject,received_on,competent_authority,deadline_note,documents_ref,decision,decided_on,effect_on_procedure,status").eq("plan_item_id", id).order("received_on", { ascending: false }).limit(200)),
    safe<ObjectionReply>(sb.from("procurement_objection_reply").select("id,objection_id,reply_text,replied_on").order("replied_on").limit(1000)),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const errMsg = sp.err ? (OBJECTION_ERR[sp.err] ?? procErr(sp.err)) : null;
  return (
    <><StaffHeader back={`/staff/procurement/bids/${id}`} backLabel="العروض" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">اعتراضات: {item.title}</h1>
      <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{OBJECTION_BANNER}. هذا سجل مستقل عن شكاوى المواطنين، والحقول القانونية فيه نصوص حرة يدخلها المستخدم دون أن يفترض النظام مهلة أو جهة أو أثرًا.</p>
      {errMsg && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{errMsg}</p>}
      {obj.missing && <PendingNotice what="سجل الاعتراضات" />}
      <section className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold text-primary">تسجيل اعتراض</h2>
        <form action={addObjection} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="item" value={id} />
          <label className="space-y-1 text-sm sm:col-span-2">المعترض<input name="objector" required maxLength={300} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">تاريخ الاستلام<input type="date" name="received" required defaultValue={today} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-3">موضوع الاعتراض<textarea name="subject" required rows={3} maxLength={3000} className="w-full rounded-xl border-2 bg-background p-2" /></label>
          <label className="space-y-1 text-sm sm:col-span-2">الجهة المختصة (نص حر)<input name="authority" maxLength={500} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm">ملاحظة المهلة (نص حر)<input name="deadline_note" maxLength={1000} className={`${fld} w-full`} /></label>
          <label className="space-y-1 text-sm sm:col-span-3">مرجع المستندات<input name="docs" maxLength={1000} className={`${fld} w-full`} /></label>
          <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground sm:col-span-3">تسجيل الاعتراض</button></form>
      </section>
      <section className="space-y-3 rounded-2xl border p-4"><h2 className="font-bold text-primary">الاعتراضات المسجَّلة</h2>
        <ObjectionsList itemId={id} rows={obj.data} replies={rep.data.filter((r) => obj.data.some((o) => o.id === r.objection_id))} today={today} /></section>
    </main></>
  );
}
