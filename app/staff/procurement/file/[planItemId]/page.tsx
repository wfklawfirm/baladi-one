import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { safe, fld } from "@/components/projects/procurement/data";
import { PendingNotice } from "@/components/projects/procurement/Notice";
import WorkflowFile, { type WfHistory } from "@/components/procurement/WorkflowFile";
import { uuidOk, METHOD } from "@/lib/council";
import { WF_METHODS, WF_PENDING_NOTE, wfErr, type FileCheck, type FileStatus, type WfStage, type WfTab, type WfTransition } from "@/lib/procurementWorkflow";
import { startFile } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ملف الشراء — BALADI ONE", referrer: "no-referrer" as const };
type Item = { id: string; title: string; planned_method: string | null };
type State = { workflow_id: string; current_stage_key: string; status: FileStatus; cycle: number };

export default async function ProcurementFilePage({ params, searchParams }: { params: Promise<{ planItemId: string }>; searchParams: Promise<{ err?: string; tab?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const { planItemId } = await params, sp = await searchParams;
  if (!uuidOk(planItemId)) notFound();
  const { data: item } = await sb.from("procurement_plan_item").select("id,title,planned_method").eq("id", planItemId).maybeSingle<Item>();
  if (!item) notFound();
  const st = await safe<State>(sb.from("procurement_file_state").select("workflow_id,current_stage_key,status,cycle").eq("plan_item_id", planItemId).limit(1));
  const state = st.data[0];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const err = sp.err ? <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{wfErr(sp.err)}</p> : null;
  const head = <StaffHeader back="/staff/procurement" backLabel="إدارة الشراء" />;
  if (st.missing) return <>{head}<main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8"><h1 className="text-2xl font-bold">ملف الشراء: {item.title}</h1><PendingNotice what="مسار الشراء حسب الأسلوب" /></main></>;
  if (!state) return (
    <>{head}<main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8"><h1 className="text-2xl font-bold">ملف الشراء: {item.title}</h1>{err}
      <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{WF_PENDING_NOTE}</p>
      <form action={startFile} className="space-y-3 rounded-2xl border p-4"><input type="hidden" name="item" value={planItemId} />
        <label className="block text-sm">أسلوب الشراء<select name="method" defaultValue={item.planned_method ?? ""} required className={`${fld} block w-full`}><option value="" disabled>اختاروا الأسلوب</option>{WF_METHODS.map((m) => <option key={m} value={m}>{METHOD[m]}</option>)}</select></label>
        <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground">بدء مسار الملف</button></form></main></>);
  const [wf, stages, trans, checks, hist] = await Promise.all([
    safe<{ method: string }>(sb.from("procurement_workflow").select("method").eq("id", state.workflow_id).limit(1)),
    safe<WfStage>(sb.from("procurement_workflow_stage").select("key,label_ar,ord,required,conditional_on,who_ar,why_ar,document_ar,review_status,legal_source_id,provision_id").eq("workflow_id", state.workflow_id).order("ord")),
    safe<WfTransition>(sb.from("procurement_workflow_transition").select("from_key,to_key,kind,guard").eq("workflow_id", state.workflow_id)),
    safe<FileCheck>(sb.from("procurement_file_check").select("stage_key,status,evidence_ref,note,due_on").eq("plan_item_id", planItemId).eq("cycle", state.cycle)),
    safe<WfHistory>(sb.from("procurement_file_history").select("id,action,from_key,to_key,note,at,cycle").eq("plan_item_id", planItemId).order("at", { ascending: false }).limit(200)),
  ]);
  const tab = (["overview", "checklist", "history"].includes(sp.tab ?? "") ? sp.tab : "overview") as WfTab["id"];
  return (
    <>{head}<main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">{err}
      <WorkflowFile itemId={planItemId} title={item.title} method={wf.data[0]?.method ?? ""} status={state.status} cycle={state.cycle} currentKey={state.current_stage_key}
        stages={stages.data} transitions={trans.data} checks={checks.data} history={hist.data} today={today} tab={tab} /></main></>
  );
}
