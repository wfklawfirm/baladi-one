"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";
import { parseAmount } from "@/lib/projects";
import { ASSET_KIND, ASSET_STATUS, CORR_STATUS, INFO_STATUS, LEGAL_CLASS, LEGAL_KIND, LEGAL_STATUS, OVERSIGHT_KIND, OVERSIGHT_STATUS, errCode, isMissingObject, refSchemeBad } from "@/lib/admin";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (v: string) => (v ? v : null);
const optDate = (v: string) => (dateOk(v) ? v : null);
const cur = (v: string) => (v === "LBP" ? "LBP" : "USD");
const flag = (fd: FormData, k: string) => s(fd, k) === "1" || s(fd, k) === "on";
/** Optional amount: empty -> null (unknown); invalid -> undefined (reject). */
const amt = (v: string): number | null | undefined => (v ? (parseAmount(v) ?? undefined) : null);
const BACK_DISPLAY = "/staff/admin/display";
const BACK = { corr: "/staff/admin/correspondence", asset: "/staff/admin/assets", legal: "/staff/admin/legal", oversight: "/staff/admin/oversight", info: "/staff/admin/transparency", hr: "/staff/admin/hr" } as const;

/** Calls an RPC; on failure redirects back with an error code (missing RPC -> "pending"); on success revalidates the module and the hub. */
async function run(rpc: string, args: Record<string, unknown>, back: string, bad = false) {
  if (bad) redirect(`${back}?err=bad_input`);
  const sb = await supabaseServer();
  const { error } = await sb.rpc(rpc, args);
  if (error) redirect(`${back}?err=${isMissingObject(error) ? "pending" : errCode(error.message)}`);
  revalidatePath(back); revalidatePath("/staff/admin");
}

// ── correspondence
export async function addCorrespondence(fd: FormData) {
  const reply = s(fd, "reply_to"), dir = s(fd, "direction");
  await run("adm_corr_add", { p_direction: dir, p_subject: s(fd, "subject"), p_party: s(fd, "party"), p_doc_date: optDate(s(fd, "doc_date")), p_referred_to: opt(s(fd, "referred_to")),
    p_deadline: optDate(s(fd, "deadline")), p_reply_to: uuidOk(reply) ? reply : null, p_notes: opt(s(fd, "notes")) }, BACK.corr, (dir !== "in" && dir !== "out") || !s(fd, "subject") || !s(fd, "party"));
}
export async function updateCorrespondence(fd: FormData) {
  const id = s(fd, "id"), st = s(fd, "status");
  await run("adm_corr_update", { p_id: id, p_status: st, p_referred_to: opt(s(fd, "referred_to")), p_deadline: optDate(s(fd, "deadline")), p_note: opt(s(fd, "note")) }, BACK.corr, !uuidOk(id) || !CORR_STATUS[st]);
}
export async function archiveCorrespondence(fd: FormData) {
  const id = s(fd, "id");
  await run("adm_corr_archive", { p_id: id, p_archived: s(fd, "archived") === "1" }, BACK.corr, !uuidOk(id));
}

// ── assets
export async function addAsset(fd: FormData) {
  const v = amt(s(fd, "value")), k = s(fd, "kind"), lc = s(fd, "legal_class") || "unclassified";
  await run("adm_asset_add", { p_kind: k, p_name: s(fd, "name"), p_location: opt(s(fd, "location")), p_legal_class: lc, p_value: v ?? null, p_currency: cur(s(fd, "currency")), p_acquired: optDate(s(fd, "acquired")), p_notes: opt(s(fd, "notes")) },
    BACK.asset, v === undefined || !ASSET_KIND[k] || !LEGAL_CLASS[lc] || !s(fd, "name"));
}
export async function updateAsset(fd: FormData) {
  const id = s(fd, "id"), v = amt(s(fd, "value")), st = s(fd, "status");
  await run("adm_asset_update", { p_id: id, p_name: s(fd, "name"), p_location: opt(s(fd, "location")), p_value: v ?? null, p_currency: cur(s(fd, "currency")), p_status: st, p_notes: opt(s(fd, "notes")) },
    BACK.asset, !uuidOk(id) || v === undefined || !ASSET_STATUS[st] || !s(fd, "name"));
}
export async function setAssetClass(fd: FormData) {
  const id = s(fd, "id"), c = s(fd, "legal_class");
  await run("adm_asset_set_class", { p_id: id, p_class: c, p_verified: flag(fd, "verified"), p_basis: opt(s(fd, "basis")) }, BACK.asset, !uuidOk(id) || !LEGAL_CLASS[c]);
}
export async function addLease(fd: FormData) {
  const id = s(fd, "asset"), r = amt(s(fd, "rent"));
  await run("adm_asset_lease_add", { p_asset: id, p_lessee: s(fd, "lessee"), p_start: optDate(s(fd, "start")), p_end: optDate(s(fd, "end")), p_rent: r ?? null, p_currency: cur(s(fd, "currency")), p_notes: opt(s(fd, "notes")) }, BACK.asset, !uuidOk(id) || r === undefined || !s(fd, "lessee"));
}
export async function setLeaseStatus(fd: FormData) {
  const id = s(fd, "id"), st = s(fd, "status");
  await run("adm_asset_lease_set_status", { p_id: id, p_status: st }, BACK.asset, !uuidOk(id) || (st !== "active" && st !== "ended"));
}
export async function addMaintenance(fd: FormData) {
  const id = s(fd, "asset"), c = amt(s(fd, "cost")), d = optDate(s(fd, "done_on"));
  await run("adm_asset_maint_add", { p_asset: id, p_done_on: d, p_description: s(fd, "description"), p_cost: c ?? null, p_currency: cur(s(fd, "currency")), p_next_due: optDate(s(fd, "next_due")) }, BACK.asset, !uuidOk(id) || c === undefined || !d || !s(fd, "description"));
}

// ── document references (text / URL only), shared by assets, legal matters, oversight items, correspondence
export async function addRef(fd: FormData) {
  const entity = s(fd, "entity"), id = s(fd, "entity_id"), back = s(fd, "back");
  const dest = Object.values(BACK).includes(back as any) ? back : "/staff/admin";
  await run("adm_ref_add", { p_entity: entity, p_entity_id: id, p_title: s(fd, "title"), p_ref: s(fd, "ref") }, dest, !["asset", "legal_matter", "oversight_item", "correspondence"].includes(entity) || !uuidOk(id) || !s(fd, "title") || !s(fd, "ref") || refSchemeBad(s(fd, "ref")));
}
export async function deleteRef(fd: FormData) {
  const id = s(fd, "id"), back = s(fd, "back"), dest = Object.values(BACK).includes(back as any) ? back : "/staff/admin";
  await run("adm_ref_delete", { p_id: id }, dest, !uuidOk(id));
}

// ── legal affairs
export async function addLegal(fd: FormData) {
  const k = s(fd, "kind");
  await run("adm_legal_add", { p_kind: k, p_title: s(fd, "title"), p_ref_no: opt(s(fd, "ref_no")), p_court: opt(s(fd, "court")), p_opposing: opt(s(fd, "opposing")), p_lawyer: opt(s(fd, "lawyer")), p_opened_on: optDate(s(fd, "opened_on")), p_judgment_on: optDate(s(fd, "judgment_on")), p_notes: opt(s(fd, "notes")) },
    BACK.legal, !LEGAL_KIND[k] || !s(fd, "title"));
}
export async function updateLegal(fd: FormData) {
  const id = s(fd, "id"), st = s(fd, "status");
  await run("adm_legal_update", { p_id: id, p_status: st, p_next_hearing: optDate(s(fd, "next_hearing")), p_outcome: opt(s(fd, "outcome")), p_lawyer: opt(s(fd, "lawyer")), p_judgment_on: optDate(s(fd, "judgment_on")) }, BACK.legal, !uuidOk(id) || !LEGAL_STATUS[st]);
}
export async function addLegalDeadline(fd: FormData) {
  const id = s(fd, "matter"), due = optDate(s(fd, "due"));
  await run("adm_legal_deadline_add", { p_matter: id, p_label: s(fd, "label"), p_due: due, p_entered_by: s(fd, "entered_by") }, BACK.legal, !uuidOk(id) || !due || !s(fd, "label"));
}
export async function setLegalDeadlineDone(fd: FormData) {
  const id = s(fd, "id");
  await run("adm_legal_deadline_set_done", { p_id: id, p_done: s(fd, "done") === "1" }, BACK.legal, !uuidOk(id));
}

// ── administrative oversight
export async function addOversight(fd: FormData) {
  const k = s(fd, "kind");
  await run("adm_oversight_add", { p_kind: k, p_subject: s(fd, "subject"), p_authority: opt(s(fd, "authority")), p_ref_no: opt(s(fd, "ref_no")), p_received_on: optDate(s(fd, "received_on")), p_due_on: optDate(s(fd, "due_on")), p_responsible: opt(s(fd, "responsible")) },
    BACK.oversight, !OVERSIGHT_KIND[k] || !s(fd, "subject"));
}
export async function updateOversight(fd: FormData) {
  const id = s(fd, "id"), st = s(fd, "status");
  await run("adm_oversight_update", { p_id: id, p_status: st, p_response: opt(s(fd, "response")), p_closure_evidence: opt(s(fd, "evidence")), p_closed_on: optDate(s(fd, "closed_on")), p_due_on: optDate(s(fd, "due_on")) }, BACK.oversight, !uuidOk(id) || !OVERSIGHT_STATUS[st]);
}

// ── transparency
export async function addInfoRequest(fd: FormData) {
  const rec = optDate(s(fd, "received_on"));
  await run("adm_info_add", { p_requester: s(fd, "requester"), p_contact: opt(s(fd, "contact")), p_subject: s(fd, "subject"), p_received_on: rec, p_due_on: optDate(s(fd, "due_on")), p_personal: flag(fd, "personal") }, BACK.info, !rec || !s(fd, "requester") || !s(fd, "subject"));
}
export async function updateInfoRequest(fd: FormData) {
  const id = s(fd, "id"), st = s(fd, "status");
  await run("adm_info_update", { p_id: id, p_status: st, p_replied_on: optDate(s(fd, "replied_on")), p_reply_summary: opt(s(fd, "reply_summary")), p_due_on: optDate(s(fd, "due_on")) }, BACK.info, !uuidOk(id) || !INFO_STATUS[st]);
}
export async function setInfoPublication(fd: FormData) {
  const id = s(fd, "id");
  await run("adm_info_set_publication", { p_id: id, p_publishable: flag(fd, "publishable"), p_personal: flag(fd, "personal"), p_redaction_required: flag(fd, "redaction_required"), p_redaction_done: flag(fd, "redaction_done") }, BACK.info, !uuidOk(id));
}
export async function setInfoDefaultDays(fd: FormData) {
  const raw = s(fd, "days"), n = raw ? Number(raw) : null;
  await run("adm_setting_set", { p_key: "info_request_default_days", p_int: n, p_verified: flag(fd, "verified"), p_note: opt(s(fd, "note")) }, BACK.info, n !== null && (!Number.isInteger(n) || n < 1 || n > 365));
}

// ── HR positions (no salary data)
export async function addPosition(fd: FormData) {
  await run("adm_hr_add", { p_name: s(fd, "name"), p_position: s(fd, "position"), p_unit: opt(s(fd, "unit")), p_assigned_on: optDate(s(fd, "assigned_on")), p_notes: opt(s(fd, "notes")) }, BACK.hr, !s(fd, "name") || !s(fd, "position"));
}
export async function endPosition(fd: FormData) {
  const id = s(fd, "id"), d = optDate(s(fd, "ended_on"));
  await run("adm_hr_end", { p_id: id, p_ended_on: d }, BACK.hr, !uuidOk(id) || !d);
}

// ── display (conference mode): screensaver on/off + idle seconds (30/60/120/300; the RPC enforces the same list)
export async function saveDisplay(fd: FormData) {
  const idle = Number(s(fd, "idle"));
  await run("adm_display_set", { p_enabled: flag(fd, "enabled"), p_idle: idle, p_qr: flag(fd, "qr") }, BACK_DISPLAY, ![30, 60, 120, 300].includes(idle));
  redirect(`${BACK_DISPLAY}?ok=1`);
}
