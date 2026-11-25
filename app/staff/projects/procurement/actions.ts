"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk, METHOD } from "@/lib/council";
import { parseAmount } from "@/lib/projects";
import { COMMITTEE_KIND, COMMITTEE_RESULT, PUB_KIND, STAGES, procErrCode } from "@/lib/procurement";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (v: string) => (v ? v : null);
const optDate = (v: string) => (dateOk(v) ? v : null);
const optUuid = (v: string) => (uuidOk(v) ? v : null);
const cur = (v: string) => (v === "LBP" ? "LBP" : "USD");
const ROOT = "/staff/projects/procurement";
const fileUrl = (id: string) => `${ROOT}/contract/${id}`;

/** Runs an RPC; on error redirects to `dest?err=<code>` (tolerates a not-yet-deployed RPC with err=pending). */
async function call(name: string, args: Record<string, unknown>, dest: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(name, args);
  if (error) redirect(`${dest}?err=${procErrCode(error)}`);
  revalidatePath(dest); revalidatePath(ROOT);
}

export async function addPlanItem(fd: FormData) {
  const v = parseAmount(s(fd, "value")), year = Number(s(fd, "year")), m = s(fd, "method");
  if (!s(fd, "title") || v === null || !Number.isInteger(year) || (m && !METHOD[m])) redirect(`${ROOT}?err=bad_input`);
  await call("procurement_plan_add", { p_year: year, p_title: s(fd, "title"), p_need: opt(s(fd, "need")), p_value: v, p_currency: cur(s(fd, "currency")), p_budget_line: optUuid(s(fd, "budget_line")), p_funding_note: opt(s(fd, "funding_note")),
    p_method: opt(m), p_responsible: opt(s(fd, "responsible")), p_publish: optDate(s(fd, "publish")), p_award: optDate(s(fd, "award")), p_start: optDate(s(fd, "start")) }, ROOT);
}
export async function setPlanStatus(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) return;
  await call("procurement_plan_set_status", { p_id: id, p_status: s(fd, "value"), p_note: opt(s(fd, "note")) }, ROOT);
}
export async function linkPlanContract(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) return;
  await call("procurement_plan_link_contract", { p_item: id, p_contract: optUuid(s(fd, "contract")) }, ROOT);
}
export async function addThreshold(fd: FormData) {
  const dest = `${ROOT}/thresholds`, min = parseAmount(s(fd, "min")), maxRaw = s(fd, "max"), max = maxRaw ? parseAmount(maxRaw) : null, from = optDate(s(fd, "from"));
  if (!METHOD[s(fd, "method")] || min === null || (maxRaw && max === null) || !from) redirect(`${dest}?err=bad_input`);
  await call("procurement_threshold_add", { p_method: s(fd, "method"), p_min: min, p_max: max, p_currency: cur(s(fd, "currency")), p_from: from, p_to: optDate(s(fd, "to")), p_source: s(fd, "source") }, dest);
}
export async function setThresholdReview(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) return;
  await call("procurement_threshold_set_review", { p_id: id, p_status: s(fd, "value"), p_effective_to: optDate(s(fd, "to")) }, `${ROOT}/thresholds`);
}
export async function setProcurementSettings(fd: FormData) {
  const dest = `${ROOT}/thresholds`, days = Number(s(fd, "days")), sim = Number(s(fd, "similarity")), pRaw = s(fd, "art29"), p = pRaw ? parseAmount(pRaw) : null;
  if (!Number.isInteger(days) || !(sim >= 0.1 && sim <= 1) || (pRaw && p === null)) redirect(`${dest}?err=bad_input`);
  await call("procurement_set_setting", { p_split_days: days, p_similarity: sim, p_art29_pct: p, p_art29_source: opt(s(fd, "art29_source")), p_art29_status: s(fd, "art29_status") === "verified" ? "verified" : "pending_review" }, dest);
}
export async function addCommittee(fd: FormData) {
  const c = s(fd, "contract"); if (!uuidOk(c) || !COMMITTEE_KIND[s(fd, "kind")]) return;
  await call("procurement_committee_add", { p_contract: c, p_kind: s(fd, "kind"), p_decision: optUuid(s(fd, "decision")), p_formed_on: optDate(s(fd, "formed")), p_notes: opt(s(fd, "notes")), p_plan_item: null }, fileUrl(c));
}
export async function addCommitteeMember(fd: FormData) {
  const c = s(fd, "contract"), cm = s(fd, "committee"); if (!uuidOk(c) || !uuidOk(cm) || !s(fd, "name")) return;
  const conflict = s(fd, "conflict");
  await call("procurement_committee_member_add", { p_committee: cm, p_name: s(fd, "name"), p_role: opt(s(fd, "role")), p_declaration_on: optDate(s(fd, "declared")), p_has_conflict: conflict === "yes" ? true : conflict === "no" ? false : null, p_note: opt(s(fd, "note")) }, fileUrl(c));
}
export async function setCommitteeReport(fd: FormData) {
  const c = s(fd, "contract"), cm = s(fd, "committee"); if (!uuidOk(c) || !uuidOk(cm) || !COMMITTEE_RESULT[s(fd, "result")]) return;
  await call("procurement_committee_report", { p_committee: cm, p_report_text: opt(s(fd, "report")), p_report_on: optDate(s(fd, "report_on")), p_result: s(fd, "result"), p_result_on: optDate(s(fd, "result_on")) }, fileUrl(c));
}
export async function addPublication(fd: FormData) {
  const c = s(fd, "contract"); if (!uuidOk(c) || !PUB_KIND[s(fd, "kind")]) return;
  const url = s(fd, "url"); if (url && !/^https?:\/\//i.test(url)) redirect(`${fileUrl(c)}?err=bad_input`);
  await call("procurement_publication_add", { p_contract: c, p_kind: s(fd, "kind"), p_url: opt(url), p_ref: opt(s(fd, "ref")), p_published_on: optDate(s(fd, "published")), p_document: opt(s(fd, "document")), p_proof: opt(s(fd, "proof")), p_notes: opt(s(fd, "notes")), p_plan_item: null }, fileUrl(c));
}
export async function setStageEvidence(fd: FormData) {
  const c = s(fd, "contract"), st = s(fd, "stage"); if (!uuidOk(c) || !(STAGES as readonly string[]).includes(st) || !s(fd, "evidence")) return;
  await call("procurement_stage_set", { p_contract: c, p_stage: st, p_evidence: s(fd, "evidence"), p_on: optDate(s(fd, "on")), p_note: opt(s(fd, "note")) }, fileUrl(c));
}
/** Late decision link: mandatory reason, real dates untouched (enforced by the RPC). `back` is a path from the form; only same-site staff paths are honoured. */
export async function linkDecisionLate(fd: FormData) {
  const c = s(fd, "contract"), d = s(fd, "decision"), back = s(fd, "back"); if (!uuidOk(c)) return;
  const dest = back.startsWith("/staff/projects") ? back.split("?")[0] : fileUrl(c);
  if (!uuidOk(d) || s(fd, "reason").length < 15) redirect(`${dest}?err=reason_required`);
  await call("contract_link_decision_late", { p_contract: c, p_decision: d, p_reason: s(fd, "reason") }, dest);
  revalidatePath(fileUrl(c)); revalidatePath("/staff/projects/contracts");
}
/** Completion with acceptance-committee check (warning needs explicit acknowledgement). */
export async function completeContract(fd: FormData) {
  const c = s(fd, "contract"), back = s(fd, "back"); if (!uuidOk(c)) return;
  const dest = back.startsWith("/staff/projects") ? back.split("?")[0] : fileUrl(c);
  await call("procurement_complete_contract", { p_id: c, p_note: opt(s(fd, "note")), p_ack: s(fd, "ack") === "1" }, dest);
  revalidatePath("/staff/projects/contracts");
}
