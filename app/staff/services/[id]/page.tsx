import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { VERSION_STATUS_AR, actionsFor, REVIEW_ERRORS } from "@/lib/review";
import Mic from "@/components/Mic";
import { BTN_PRIMARY, Chip, Notice, StepCard } from "@/components/simple/kit";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));
const UUID = /^[0-9a-f-]{36}$/i;

async function transition(id: string, formData: FormData) {
  "use server";
  const { sb } = await requireStaff();
  const to = String(formData.get("to") ?? "");
  if (!VERSION_STATUS_AR[to]) return;
  const { error } = await sb.rpc("review_service_version", { p_id: id, p_to: to, p_note: String(formData.get("note") ?? "") });
  const code = error ? (Object.keys(REVIEW_ERRORS).find((k) => error.message.includes(k)) ?? "forbidden") : "";
  redirect(`/staff/services/${id}${code ? `?e=${code}` : ""}`);
}

export default async function VersionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { sb, memberships } = await requireStaff();
  const roles = memberships.map((m) => m.role as string);
  if (!roles.some((r) => r === "mayor" || r === "admin")) redirect("/staff");
  const { data: v } = await sb.from("service_version").select("*,municipal_service(slug,category,scope)").eq("id", id).maybeSingle();
  if (!v) notFound();
  const { data: audit } = await sb.from("audit_event").select("action,detail,created_at").eq("entity", "service_version").eq("entity_id", id).order("id");
  const err = REVIEW_ERRORS[(await searchParams).e ?? ""];
  const isDemo = memberships.some((m) => m.is_demo);
  const actions = isDemo ? [] : actionsFor(v.status, roles);
  const list = (x: any) => (Array.isArray(x) ? x : []).map((i) => (typeof i === "string" ? i : i?.title ?? i?.text ?? JSON.stringify(i)));
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
      <Link href="/staff/services" className="inline-flex min-h-11 items-center text-base font-semibold text-primary">← اعتماد الخدمات</Link>
      <header className="space-y-1"><h1 className="text-2xl font-bold">{v.title_ar}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">نسخة {v.version_no} · <Chip tone={v.status === "approved" ? "ok" : v.status === "in_review" ? "wait" : "info"}>{VERSION_STATUS_AR[v.status]}</Chip>{v.approved_at ? ` · اعتُمدت ${fmt(v.approved_at)}` : ""}</p></header>
      {err && <Notice tone="bad">{err}</Notice>}
      <section className="space-y-3 rounded-2xl border bg-background p-4 leading-8">
        {v.summary_ar && <p>{v.summary_ar}</p>}
        {v.authority_ar && <p><b>الجهة المسؤولة:</b> {v.authority_ar}</p>}
        {v.municipal_role_ar && <p><b>دور البلدية:</b> {v.municipal_role_ar}</p>}
        {v.processing_time_ar && <p><b>مدة الإنجاز:</b> {v.processing_time_ar}</p>}
        {list(v.documents).length > 0 && <div><b>الأوراق المطلوبة من المواطن</b><ul className="list-disc ps-6">{list(v.documents).map((d, i) => <li key={i}>{d}</li>)}</ul></div>}
        {list(v.steps).length > 0 && <div><b>خطوات الخدمة</b><ol className="list-decimal ps-6">{list(v.steps).map((d, i) => <li key={i}>{d}</li>)}</ol></div>}
      </section>
      {actions.length > 0 && (
        <StepCard title="ما قراركم في هذه الخدمة؟" hint="اقرؤوا الصفحة أعلاه أولًا. عند الاعتماد تظهر الخدمة للمواطنين بهذا النص. وإذا أعدتموها للمسودة يعدّلها الموظف ويرسلها لكم من جديد.">
        <form action={transition.bind(null, id)} className="space-y-3">
          <div className="relative"><textarea id="svc-note" name="note" maxLength={500} rows={2} placeholder="ملاحظة (اختياري)" className="w-full rounded-xl border bg-background p-3 pe-16" />
            <Mic target="svc-note" className="absolute bottom-3 end-2" /></div>
          <div className="flex flex-wrap gap-2">{actions.map((a) => <button key={a.to} name="to" value={a.to} className={`${BTN_PRIMARY} flex-1`}>{a.label}</button>)}</div>
        </form></StepCard>
      )}
      <section className="space-y-2"><h2 className="text-lg font-bold">ما جرى لهذه الخدمة</h2>
        <ol className="space-y-2 border-s ps-4">{(audit ?? []).map((a: any, i) => (
          <li key={i}><p className="font-semibold">{VERSION_STATUS_AR[a.detail?.to] ?? a.action}</p><p className="text-xs text-muted-foreground">{fmt(a.created_at)}</p>{a.detail?.note && <p className="text-sm">{a.detail.note}</p>}</li>))}</ol></section>
    </main>
  );
}
