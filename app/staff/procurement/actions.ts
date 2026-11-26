"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";
import { parseAmount } from "@/lib/projects";
import { procErrCode } from "@/lib/procurement";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (v: string) => (v ? v : null);
const ROOT = "/staff/procurement";

async function call(name: string, args: Record<string, unknown>, dest: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(name, args);
  if (error) redirect(`${dest}?err=${procErrCode(error)}`);
  revalidatePath(dest);
}

export async function addSupplier(fd: FormData) {
  const dest = `${ROOT}/suppliers`;
  if (!s(fd, "name")) redirect(`${dest}?err=bad_input`);
  const exp = s(fd, "docs_expire");
  await call("procurement_supplier_add", { p_name: s(fd, "name"), p_form: opt(s(fd, "form")), p_contact: opt(s(fd, "contact")), p_registry: opt(s(fd, "registry")), p_docs_expire: dateOk(exp) ? exp : null, p_notes: opt(s(fd, "notes")) }, dest);
}
/** "YYYY-MM-DDTHH:mm" typed as Beirut local time -> UTC ISO string (handles DST). */
function beirutToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const asUtc = Date.parse(`${v}:00Z`); if (Number.isNaN(asUtc)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(asUtc)).map((x) => [x.type, x.value]));
  const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  let t = asUtc - (shown - asUtc);                       // first guess, then correct once for DST edges
  const p2 = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  t += asUtc - Date.parse(`${p2.year}-${p2.month}-${p2.day}T${p2.hour}:${p2.minute}:${p2.second}Z`);
  return new Date(t).toISOString();
}
export async function setBidsOpen(fd: FormData) {
  const id = s(fd, "item"), dest = `${ROOT}/bids/${id}`;
  if (!uuidOk(id)) redirect(`${ROOT}?err=bad_input`);
  const iso = beirutToIso(s(fd, "open"));
  if (!iso) redirect(`${dest}?err=bad_input`);
  await call("procurement_set_bids_open", { p_item: id, p_open: iso }, dest);
}
export async function addBid(fd: FormData) {
  const item = s(fd, "item"), sup = s(fd, "supplier"), dest = `${ROOT}/bids/${item}`, v = parseAmount(s(fd, "total")), rec = s(fd, "received");
  if (!uuidOk(item) || !uuidOk(sup) || v === null || !dateOk(rec)) redirect(`${dest}?err=bad_input`);
  const days = s(fd, "days");
  await call("procurement_bid_add", { p_item: item, p_supplier: sup, p_received: rec, p_currency: s(fd, "currency") === "LBP" ? "LBP" : "USD", p_total: v, p_days: days && /^\d+$/.test(days) ? Number(days) : null, p_warranty: opt(s(fd, "warranty")), p_note: opt(s(fd, "note")) }, dest);
}
export async function evaluateBid(fd: FormData) {
  const bid = s(fd, "bid"), item = s(fd, "item"), dest = `${ROOT}/bids/${item}`, c = s(fd, "compliant");
  if (!uuidOk(bid) || !uuidOk(item) || !["yes", "no"].includes(c)) redirect(`${dest}?err=bad_input`);
  await call("procurement_bid_evaluate", { p_bid: bid, p_compliant: c === "yes", p_note: opt(s(fd, "note")) }, dest);
}

// ---- Objections register + plan-item committees (0043 draft; committees reuse 0024 RPCs) ----
async function callObj(name: string, args: Record<string, unknown>, dest: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(name, args);
  if (error) redirect(`${dest}?err=${(error.message ?? "").includes("objection_closed") ? "objection_closed" : procErrCode(error)}`);
  revalidatePath(dest);
}
export async function addObjection(fd: FormData) {
  const item = s(fd, "item"), dest = `${ROOT}/objections/${item}`, rec = s(fd, "received");
  if (!uuidOk(item) || !s(fd, "objector") || !s(fd, "subject") || !dateOk(rec)) redirect(`${dest}?err=bad_input`);
  await callObj("procurement_objection_add", { p_item: item, p_objector: s(fd, "objector"), p_subject: s(fd, "subject"), p_received: rec, p_authority: opt(s(fd, "authority")), p_deadline_note: opt(s(fd, "deadline_note")), p_docs: opt(s(fd, "docs")) }, dest);
}
export async function addObjectionReply(fd: FormData) {
  const item = s(fd, "item"), ob = s(fd, "objection"), dest = `${ROOT}/objections/${item}`, d = s(fd, "replied");
  if (!uuidOk(item) || !uuidOk(ob) || !s(fd, "reply") || !dateOk(d)) redirect(`${dest}?err=bad_input`);
  await callObj("procurement_objection_reply_add", { p_objection: ob, p_reply: s(fd, "reply"), p_replied_on: d }, dest);
}
export async function decideObjection(fd: FormData) {
  const item = s(fd, "item"), ob = s(fd, "objection"), dest = `${ROOT}/objections/${item}`, d = s(fd, "decided");
  if (!uuidOk(item) || !uuidOk(ob) || !s(fd, "decision") || !dateOk(d)) redirect(`${dest}?err=bad_input`);
  await callObj("procurement_objection_decide", { p_objection: ob, p_decision: s(fd, "decision"), p_decided_on: d, p_effect: opt(s(fd, "effect")) }, dest);
}
export async function withdrawObjection(fd: FormData) {
  const item = s(fd, "item"), ob = s(fd, "objection"), dest = `${ROOT}/objections/${item}`;
  if (!uuidOk(item) || !uuidOk(ob)) redirect(`${dest}?err=bad_input`);
  await callObj("procurement_objection_withdraw", { p_objection: ob }, dest);
}
export async function addItemCommittee(fd: FormData) {
  const item = s(fd, "item"), dest = `${ROOT}/bids/${item}`, kind = s(fd, "kind"), dec = s(fd, "decision"), f = s(fd, "formed");
  if (!uuidOk(item) || !["award", "acceptance"].includes(kind)) redirect(`${dest}?err=bad_input`);
  await callObj("procurement_committee_add", { p_contract: null, p_kind: kind, p_decision: uuidOk(dec) ? dec : null, p_formed_on: dateOk(f) ? f : null, p_notes: opt(s(fd, "notes")), p_plan_item: item }, dest);
}
export async function addItemCommitteeMember(fd: FormData) {
  const item = s(fd, "item"), cm = s(fd, "committee"), dest = `${ROOT}/bids/${item}`, c = s(fd, "conflict"), d = s(fd, "declared");
  if (!uuidOk(item) || !uuidOk(cm) || !s(fd, "name")) redirect(`${dest}?err=bad_input`);
  await callObj("procurement_committee_member_add", { p_committee: cm, p_name: s(fd, "name"), p_role: opt(s(fd, "role")), p_declaration_on: dateOk(d) ? d : null, p_has_conflict: c === "yes" ? true : c === "no" ? false : null, p_note: opt(s(fd, "note")) }, dest);
}
export async function setItemCommitteeReport(fd: FormData) {
  const item = s(fd, "item"), cm = s(fd, "committee"), dest = `${ROOT}/bids/${item}`, ro = s(fd, "report_on"), rs = s(fd, "result_on");
  if (!uuidOk(item) || !uuidOk(cm) || !["pending", "accepted", "accepted_reservations", "rejected"].includes(s(fd, "result"))) redirect(`${dest}?err=bad_input`);
  await callObj("procurement_committee_report", { p_committee: cm, p_report_text: opt(s(fd, "report")), p_report_on: dateOk(ro) ? ro : null, p_result: s(fd, "result"), p_result_on: dateOk(rs) ? rs : null }, dest);
}

// ---------- document factory (0045) ----------
import { isDocKey } from "@/lib/procurementDocs/types";
import { generateDoc, TEMPLATE_VERSION } from "@/lib/procurementDocs/generate";
import { contentHash, loadDocInput } from "@/lib/procurementDocs/load";
import { renderHtml } from "@/lib/procurementDocs/html";
import { loadTemplate } from "@/lib/decisions/load";

/** Generates (and records, through the audited RPC) a draft document, then opens its printable view. A refusal is shown on the view page. */
export async function generateProcDoc(fd: FormData) {
  const item = s(fd, "item"), key = s(fd, "key"), bid = s(fd, "bid");
  if (!uuidOk(item) || !isDocKey(key)) redirect(`${ROOT}?err=bad_input`);
  const view = `${ROOT}/docs/${item}/${key}${uuidOk(bid) ? `?bid=${bid}` : ""}`;
  const sb = await supabaseServer();
  const input = await loadDocInput(sb, item, uuidOk(bid) ? bid : null);
  if (!input) redirect(`${ROOT}?err=not_found`);
  const doc = generateDoc(key, input);
  if (!doc.ok) redirect(view);                                   // the view page prints the Arabic refusal
  const { data, error } = await sb.rpc("procurement_document_record", { p_item: item, p_key: key, p_version: TEMPLATE_VERSION[key], p_format: "html",
    p_sources: doc.sources, p_autofilled: doc.autofilled.map((a) => ({ label: a.label, source_table: a.source.table, source_id: a.source.id })), p_hash: await contentHash(renderHtml(doc)) });
  if (error || !data) redirect(`${ROOT}/docs/${item}?err=${procErrCode(error)}`);
  redirect(`${view}${view.includes("?") ? "&" : "?"}rec=${data}`);
}

/** 'إنشاء مسودة قرار': calls the EXISTING decision_builder_create (inside the audited RPC) for a procurement-domain template and links the draft to the plan item. */
export async function createProcDecision(fd: FormData) {
  const item = s(fd, "item"), ver = s(fd, "version"), sess = s(fd, "session"), dest = `${ROOT}/docs/${item}`;
  if (!uuidOk(item) || !uuidOk(ver)) redirect(`${ROOT}?err=bad_input`);
  const sb = await supabaseServer();
  const { data: pi } = await sb.from("procurement_plan_item").select("title").eq("id", item).maybeSingle();
  const tpl = await loadTemplate(sb, ver);
  // Only a field the template itself defines is pre-filled, and only from the plan item record.
  const data: Record<string, string> = {};
  if (pi?.title && tpl?.content?.fields?.some((f) => f.key === "procurement_ref")) data.procurement_ref = pi.title;
  const { data: id, error } = await sb.rpc("procurement_plan_create_decision", { p_item: item, p_version: ver, p_session: uuidOk(sess) ? sess : null, p_data: data });
  if (error || !id) redirect(`${dest}?err=${encodeURIComponent((error?.message ?? "").split(":")[0].trim() || "1")}`);
  revalidatePath(dest);
  redirect(`/staff/decisions/${id}`);
}
