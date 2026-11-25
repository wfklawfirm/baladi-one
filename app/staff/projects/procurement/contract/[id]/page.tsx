import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { METHOD, uuidOk } from "@/lib/council";
import { CONTRACT_STATUS } from "@/lib/projects";
import { buildFile } from "@/lib/procurement";
import FileStages from "@/components/projects/procurement/FileStages";
import CommitteeSection, { type Committee, type Member } from "@/components/projects/procurement/CommitteeSection";
import PublicationSection, { type Publication } from "@/components/projects/procurement/PublicationSection";
import AmendmentSection, { type Amend } from "@/components/projects/procurement/AmendmentSection";
import { LateBadge, LateLinkForm } from "@/components/projects/procurement/LateLink";
import { ErrNotice, PendingNotice } from "@/components/projects/procurement/Notice";
import { money, safe } from "@/components/projects/procurement/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "ملف الشراء — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
type C = { id: string; contractor: string; subject: string; value: number; currency: string; status: string; procurement_method: string | null; published_on: string | null; award_notice_on: string | null; signed_on: string | null; decision_id: string | null; start_on: string | null; objection_pending?: boolean; objection_resolved_on?: string | null; decision_linked_late?: boolean; decision_linked_late_on?: string | null; decision_link_reason?: string | null; decision_link_after_signing?: boolean | null };

export default async function ProcurementFile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { id } = await params; const sp = await searchParams;
  if (!uuidOk(id)) notFound();
  const { data: c0 } = await sb.from("contract").select("*").eq("id", id).maybeSingle();
  if (!c0) notFound();
  const c = c0 as C;
  const [com, mem, pub, ev, am, plan, set, dec] = await Promise.all([
    safe<Committee>(sb.from("procurement_committee").select("id,kind,formation_decision_id,formed_on,notes,report_text,report_on,result,result_on").eq("contract_id", id).order("created_at")),
    safe<Member & { committee_id: string }>(sb.from("procurement_committee_member").select("id,committee_id,name,role_ar,declaration_on,has_conflict,declaration_note").order("created_at").limit(500)),
    safe<Publication>(sb.from("procurement_publication").select("id,kind,platform_url,reference_no,published_on,document_ref,proof_ref,notes").eq("contract_id", id).order("created_at")),
    safe<{ stage: string; evidence_ref: string; evidence_on: string | null }>(sb.from("procurement_stage_evidence").select("stage,evidence_ref,evidence_on").eq("contract_id", id)),
    safe<Amend>(sb.from("contract_amendment").select("delta,reason,decision_id,created_at").eq("contract_id", id).order("created_at")),
    safe<{ budget_line_id: string | null; estimated_value: number; funding_note: string | null }>(sb.from("procurement_plan_item").select("budget_line_id,estimated_value,funding_note").eq("contract_id", id).limit(1)),
    safe<{ art29_limit_pct: number | null; art29_review_status: string }>(sb.from("procurement_setting").select("art29_limit_pct,art29_review_status").limit(1)),
    safe<{ id: string; decision_no: string; year: number; title: string }>(sb.from("municipal_decision").select("id,decision_no,year,title").in("legal_status", ["adopted", "under_review", "effective"]).order("created_at", { ascending: false }).limit(200)),
  ]);
  const decisions = dec.data.map((d) => ({ id: d.id, label: `${d.decision_no}/${d.year} — ${d.title}` }));
  const cids = new Set(com.data.map((x) => x.id));
  const members = mem.data.filter((m) => cids.has(m.committee_id));
  const stages = buildFile({ contract: c, manual: ev.data, publications: pub.data, committees: com.data, plan: plan.data[0] ?? null, today: today() });
  const missingAny = com.missing || pub.missing || ev.missing;
  return (
    <><StaffHeader back="/staff/projects/contracts" backLabel="سجل العقود" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <header className="space-y-1"><h1 className="text-2xl font-extrabold">ملف الشراء</h1>
        <p className="text-base leading-7 text-muted-foreground">هنا تتابعون مراحل شراء هذا العقد خطوة بخطوة: اللجان، والنشر الرسمي، والتعديلات. كل مرحلة تُسجَّل بدليلها.</p>
        <p className="text-sm"><b>{c.contractor}</b> — {c.subject}</p>
        <p className="text-sm text-muted-foreground">{CONTRACT_STATUS[c.status]} · {money(c.value, c.currency)} · الأسلوب: {c.procurement_method ? METHOD[c.procurement_method] : "غير محدد"} · <Link href="/staff/projects/procurement" className="text-primary underline">الشراء العام</Link></p></header>
      <ErrNotice err={sp.err} />
      {missingAny && <PendingNotice what="ملف الشراء الكامل" />}
      <LateBadge late={c.decision_linked_late !== undefined ? { decision_linked_late: !!c.decision_linked_late, decision_linked_late_on: c.decision_linked_late_on ?? null, decision_link_reason: c.decision_link_reason ?? null, decision_link_after_signing: c.decision_link_after_signing ?? null } : null} />
      {!c.decision_id && <div className="space-y-1 rounded-xl border p-3"><p className="text-sm font-semibold text-destructive">⚠ العقد غير مربوط بقرار من المجلس البلدي.</p><LateLinkForm contractId={id} decisions={decisions} /></div>}
      <FileStages contractId={id} stages={stages} />
      <CommitteeSection contractId={id} committees={com.data} members={members} decisions={decisions} />
      <PublicationSection contractId={id} rows={pub.data} />
      <AmendmentSection currentValue={Number(c.value)} currency={c.currency} rows={am.data} limitPct={set.data[0]?.art29_limit_pct ?? null} limitStatus={set.data[0]?.art29_review_status} />
    </main></>
  );
}
