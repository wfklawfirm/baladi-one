import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { brainConfigured } from "@/lib/brain/rag";
import StaffHeader from "@/components/StaffHeader";
import DecisionEditor from "@/components/decisions/DecisionEditor";
import { uuidOk, CATEGORY, LEGAL_STATUS, VALIDATION_LEVEL } from "@/lib/council";
import { loadRules, loadSources, withLibrary } from "@/lib/decisions/load";
import { candidateRefs, defaultClauses, defaultRecitals, mergeRecitals } from "@/lib/decisions/engine";
import { autofill } from "@/lib/decisions/data";
import { STATUS_LABEL, type DraftData, type TemplateContent } from "@/lib/decisions/model";
import { setBuilderReview, setRegisterDates } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "محرر القرار — BALADI ONE", referrer: "no-referrer" as const };
const ft = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { data: d } = await sb.from("municipal_decision").select("*").eq("id", id).maybeSingle();
  if (!d) notFound();
  if (!d.template_snapshot) redirect(`/staff/council/decisions/${id}`);
  const snap = d.template_snapshot as TemplateContent & { _meta?: { template_id: string; version: string; status_at_creation: string } };
  const [sources, rules, muni, sess, mayor, revs, tpl] = await Promise.all([
    loadSources(sb), loadRules(sb),
    sb.from("municipality").select("name_ar,governorate_ar,district_ar,legal_profile_verified_on").eq("id", d.municipality_id).maybeSingle(),
    d.session_id ? sb.from("council_session").select("session_no,title,held_on,members_total,members_present,summoned_on,is_second_meeting").eq("id", d.session_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("staff_member").select("display_name").eq("municipality_id", d.municipality_id).eq("role", "mayor").limit(1).maybeSingle(),
    sb.from("decision_revision").select("rev,title,created_at,actor").eq("decision_id", id).order("rev", { ascending: false }).limit(30),
    d.template_version_id ? sb.from("decision_template_version").select("status,version,template_id").eq("id", d.template_version_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const refs = withLibrary(candidateRefs(snap, sources, rules));
  const user = (d.draft_data ?? {}) as DraftData;
  const auto = autofill(snap, { muni: { name_ar: muni.data?.name_ar ?? "", governorate_ar: muni.data?.governorate_ar ?? null, district_ar: muni.data?.district_ar ?? null },
    decision: { decision_no: d.decision_no, year: d.year, decided_on: d.decided_on, vote_for: d.vote_for, vote_against: d.vote_against, vote_abstain: d.vote_abstain },
    session: sess.data ?? null, mayorName: mayor.data?.display_name ?? null });
  const selected = user.selected_refs ?? refs.filter((r) => r.eligible).map((r) => ({ source_id: r.source_id, article: r.article }));
  const data: DraftData = { ...user, ...auto, selected_refs: selected,
    recitals: mergeRecitals(user.recitals, defaultRecitals(snap, refs, selected)), clauses: user.clauses ?? defaultClauses(snap) };
  const canEdit = d.legal_status === "draft";
  const tplStatus = tpl.data?.status as keyof typeof STATUS_LABEL | undefined;
  const { data: ev } = await sb.from("decision_event").select("id,kind,to_value,note,created_at").eq("decision_id", id).order("created_at", { ascending: false }).limit(15);
  return (
    <>
      <StaffHeader back="/staff/decisions" backLabel="المنشئ" />
      <main dir="rtl" lang="ar" className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">قرار {d.decision_no}/{d.year}</h1>
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary">{LEGAL_STATUS[d.legal_status]}</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold" dir="ltr">{snap._meta?.template_id ?? snap.id} v{snap._meta?.version ?? snap.version}</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">القالب: {tplStatus ? STATUS_LABEL[tplStatus] : "—"}</span>
          <Link href={`/staff/council/decisions/${id}`} className="ms-auto min-h-10 rounded-xl border px-3 py-2 text-sm hover:bg-muted">ملف القرار وسجل المتابعة</Link>
        </div>
        {tplStatus !== "approved" && <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">القالب لم يُعتمد قانونيًا بعد: تبقى هذه الوثيقة مسودة بعلامة مائية، ولا يمكن اعتمادها رسميًا قبل اعتماد القالب بمراجعة محامٍ.</p>}
        {!muni.data?.governorate_ar && <p className="rounded-xl border p-3 text-sm text-muted-foreground">محافظة البلدية وقضاؤها غير مُدخلَين: يظهر الترويس ناقصًا حتى يُدخلهما المسؤول من <Link className="underline" href="/staff/decisions/templates">إدارة القوالب</Link>.</p>}
        <DecisionEditor id={id} initialTitle={d.title} snap={snap} initial={data} refs={refs} rules={rules} canEdit={canEdit} aiOn={brainConfigured()}
          meta={{ category: d.category, level: d.validation_level ?? "none", issuer: snap.issuer_candidate, categoryLabel: CATEGORY[d.category] ?? d.category, levelLabel: VALIDATION_LEVEL[d.validation_level ?? "none"], decidedOn: d.decided_on }} />
        <section className="grid gap-4 lg:grid-cols-3">
          <form action={setBuilderReview} className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">النوع ومستوى التصديق</h2>
            <input type="hidden" name="id" value={id} />
            <label className="block text-sm">الفئة<select name="category" defaultValue={d.category} className="mt-1 min-h-11 w-full rounded-xl border px-2">{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block text-sm">التصديق<select name="level" defaultValue={d.validation_level ?? "none"} className="mt-1 min-h-11 w-full rounded-xl border px-2">{Object.entries(VALIDATION_LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <p className="text-xs text-muted-foreground">يحدّد النوع صيغة النفاذ المقترحة. التصنيف قابل للمراجعة القانونية.</p>
            <button className="min-h-10 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ</button></form>
          <form action={setRegisterDates} className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">السجل الرسمي (المادتان 44 و46)</h2>
            <input type="hidden" name="id" value={id} />
            <label className="block text-sm">تاريخ النشر<input type="date" name="published" defaultValue={d.published_on ?? ""} className="mt-1 min-h-11 w-full rounded-xl border px-2" /></label>
            <label className="block text-sm">تاريخ التبليغ<input type="date" name="notified" defaultValue={d.notified_on ?? ""} className="mt-1 min-h-11 w-full rounded-xl border px-2" /></label>
            <p className="text-xs text-muted-foreground">تاريخ الإرسال إلى سلطة الرقابة والتصديق في ملف القرار. السجل الرقمي لا يغني عن السجل الرسمي الورقي للبلدية.</p>
            <button className="min-h-10 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ التواريخ</button></form>
          <div className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">سجل التعديلات</h2>
            <ul className="max-h-56 space-y-1 overflow-auto text-xs">{(revs.data ?? []).map((r) => <li key={r.rev} className="flex justify-between gap-2 border-b py-1"><span>نسخة {r.rev}</span><span className="text-muted-foreground">{ft(r.created_at)}</span></li>)}</ul>
            <h3 className="pt-2 text-sm font-bold">الأحداث</h3>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs">{(ev ?? []).map((e) => <li key={e.id} className="border-b py-1">{e.note ?? e.kind} <span className="text-muted-foreground">{ft(e.created_at)}</span></li>)}</ul></div>
        </section>
      </main>
    </>
  );
}
