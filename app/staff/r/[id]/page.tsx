import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { REPORT_TYPES, STATUS_AR } from "@/lib/reports";
import Mic from "@/components/Mic";
import { BTN_PRIMARY, BTN_SECONDARY, Chip, StepCard } from "@/components/simple/kit";

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
  const { data: atts } = await sb.from("report_attachment").select("id,file_name,mime,size_bytes").eq("request_id", id).order("created_at");
  const { data: hist } = await sb.from("request_status_history").select("to_status,note,internal,created_at").eq("request_id", id).order("created_at");
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-2xl space-y-5 p-4 md:p-8 lg:max-w-7xl">
      <Link href="/staff/requests" className="text-sm text-primary">← الطلبات</Link>
      <header className="space-y-1"><h1 className="text-2xl font-bold">{r.kind === "service_request" ? `معاملة: ${r.service_title ?? ""}` : (REPORT_TYPES.find(([k]) => k === r.report_type)?.[1] ?? "طلب")}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{fmt(r.created_at)} · <Chip tone={r.status === "done" ? "ok" : r.status === "rejected" || r.status === "cancelled" ? "bad" : "wait"}>{STATUS_AR[r.status]}</Chip>{r.is_demo ? " · تجريبي" : ""}</p></header>
      <section className="space-y-2 rounded-2xl border bg-background p-4">
        <p className="whitespace-pre-line leading-8">{r.description}</p>
        {r.applicant_name && <p className="text-sm"><b>مقدّم الطلب:</b> {r.applicant_name}{r.channel ? ` · ${r.channel === "kiosk" ? "من الكيوسك" : "من التطبيق"}` : ""}</p>}
        {r.location_text && <p className="text-sm"><b>الموقع:</b> {r.location_text}</p>}
        {r.contact_phone && <p className="text-sm"><b>الهاتف:</b> <span dir="ltr">{r.contact_phone}</span></p>}
      </section>
      {(atts ?? []).length > 0 && (
        <section className="space-y-2 rounded-2xl border bg-background p-4"><h2 className="font-bold">المرفقات ({(atts ?? []).length})</h2>
          <ul className="grid gap-3 sm:grid-cols-3">{(atts ?? []).map((a: any) => (
            <li key={a.id} className="space-y-1.5">
              {a.mime.startsWith("image/") ? <a href={`/staff/r/${id}/file/${a.id}`} target="_blank" rel="noopener noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/staff/r/${id}/file/${a.id}`} alt={a.file_name} className="aspect-video w-full rounded-xl border object-cover" /></a>
                : <a href={`/staff/r/${id}/file/${a.id}`} target="_blank" rel="noopener noreferrer" className="grid aspect-video place-items-center rounded-xl border bg-muted font-bold text-primary">PDF</a>}
              <p className="truncate text-xs text-muted-foreground" dir="auto">{a.file_name} · {Math.max(1, Math.round(a.size_bytes / 1024))} KB</p>
            </li>))}</ul>
          <p className="text-xs text-muted-foreground">ملفات أرسلها المواطن؛ افتحوها بحذر ولا تعتمدوها وثائق رسمية.</p></section>)}
      <Link href={`/staff/analyze?t=${encodeURIComponent(r.description ?? "")}`} className="flex min-h-12 items-center justify-center rounded-xl border-2 border-primary font-semibold text-primary active:bg-muted">اطلبوا من المساعد قراءة الطلب وتلخيصه</Link>
      <StepCard title="ماذا تريدون أن تفعلوا بهذا الطلب؟" hint="اكتبوا ملاحظة اختيارية ثم اضغطوا الزر المناسب. يُسجَّل التغيير في السجل أدناه.">
        <form action={change.bind(null, id)} className="space-y-3">
          <div className="relative"><textarea id="req-note" name="note" maxLength={500} rows={3} aria-label="ملاحظتكم" placeholder="اكتبوا ملاحظتكم هنا (اختياري)" className="w-full rounded-xl border-2 bg-background p-3 pe-16 text-base" />
            <Mic target="req-note" className="absolute bottom-3 end-2" /></div>
          <label className="flex items-start gap-2 text-base"><input type="checkbox" name="public" className="mt-1 size-5" /> أظهروا ملاحظتي للمواطن في صفحة تتبّع طلبه</label>
          <div className="grid gap-3 sm:grid-cols-3">
            {r.status !== "done" && <button name="status" value="done" className={BTN_PRIMARY}>أنجزتُ الطلب</button>}
            {r.status !== "needs_info" && <button name="status" value="needs_info" className={BTN_SECONDARY}>أطلب معلومات إضافية</button>}
            {r.status === "received" && <button name="status" value="in_progress" className={BTN_SECONDARY}>بدأتُ المعالجة</button>}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">«أنجزتُ» تُظهر للمواطن أن طلبه تمّ. «أطلب معلومات» تُظهر له أنكم تنتظرون منه استكمالًا، وتظهر ملاحظتكم له فقط إن فعّلتم الخانة أعلاه.</p>
          <details className="rounded-xl bg-muted/50 px-3 py-2 text-sm"><summary className="cursor-pointer font-semibold">خيارات أخرى</summary>
            <div className="grid gap-2 pt-2 sm:grid-cols-3">{(["rejected", "cancelled"] as const).map((k) => <button key={k} name="status" value={k} className={BTN_SECONDARY}>{k === "rejected" ? "ارفض الطلب" : "ألغِ الطلب"}</button>)}</div></details>
        </form>
      </StepCard>
      <section className="space-y-2"><h2 className="text-lg font-bold">ما جرى في هذا الطلب</h2>
        <ol className="space-y-2 border-s ps-4">{(hist ?? []).map((h, i) => (
          <li key={i}><p className="font-semibold">{STATUS_AR[h.to_status]}{h.internal ? " · داخلي" : " · ظاهر للمواطن"}</p><p className="text-xs text-muted-foreground">{fmt(h.created_at)}</p>{h.note && <p className="text-sm">{h.note}</p>}</li>))}</ol></section>
    </main>
  );
}
