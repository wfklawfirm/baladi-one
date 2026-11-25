import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { REPORT_TYPES, STATUS_AR } from "@/lib/reports";
import Mic from "@/components/Mic";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));

async function change(id: string, formData: FormData) {
  "use server";
  const { sb } = await requireStaff();
  const status = String(formData.get("status") ?? "");
  if (!STATUS_AR[status]) return;
  await sb.rpc("staff_set_status", { p_id: id, p_status: status, p_note: String(formData.get("note") ?? ""), p_public: formData.get("public") === "on" });
  redirect(`/staff/r/${id}`);
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb } = await requireStaff();
  const { data: r } = await sb.from("citizen_request").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: hist } = await sb.from("request_status_history").select("to_status,note,internal,created_at").eq("request_id", id).order("created_at");
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-2xl space-y-5 p-4 md:p-8 lg:max-w-7xl">
      <Link href="/staff/requests" className="text-sm text-primary">← الطلبات</Link>
      <header className="space-y-1"><h1 className="text-2xl font-bold">{REPORT_TYPES.find(([k]) => k === r.report_type)?.[1] ?? "طلب"}</h1>
        <p className="text-sm text-muted-foreground">{fmt(r.created_at)} · الحالة: <b className="text-primary">{STATUS_AR[r.status]}</b>{r.is_demo ? " · تجريبي" : ""}</p></header>
      <section className="space-y-2 rounded-2xl border bg-background p-4">
        <p className="whitespace-pre-line leading-8">{r.description}</p>
        {r.location_text && <p className="text-sm"><b>الموقع:</b> {r.location_text}</p>}
        {r.contact_phone && <p className="text-sm"><b>الهاتف:</b> <span dir="ltr">{r.contact_phone}</span></p>}
      </section>
      <Link href={`/staff/analyze?t=${encodeURIComponent(r.description ?? "")}`} className="flex min-h-12 items-center justify-center rounded-xl border-2 border-primary font-semibold text-primary active:bg-muted">قراءة الطلب بالمساعد الذكي</Link>
      <form action={change.bind(null, id)} className="space-y-3 rounded-2xl border bg-background p-4">
        <h2 className="font-bold">تحديث الحالة</h2>
        <select name="status" defaultValue={r.status} className="min-h-12 w-full rounded-xl border bg-background px-3">{Object.entries(STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <div className="relative"><textarea id="req-note" name="note" maxLength={500} rows={3} placeholder="ملاحظة (اختياري)" className="w-full rounded-xl border bg-background p-3 pe-16" />
          <Mic target="req-note" className="absolute bottom-3 end-2" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" /> إظهار الملاحظة للمواطن في صفحة التتبع</label>
        <button className="min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground">حفظ</button>
      </form>
      <section className="space-y-2"><h2 className="font-bold">السجل</h2>
        <ol className="space-y-2 border-s ps-4">{(hist ?? []).map((h, i) => (
          <li key={i}><p className="font-semibold">{STATUS_AR[h.to_status]}{h.internal ? " · داخلي" : " · ظاهر للمواطن"}</p><p className="text-xs text-muted-foreground">{fmt(h.created_at)}</p>{h.note && <p className="text-sm">{h.note}</p>}</li>))}</ol></section>
    </main>
  );
}
