"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";
import { WF_METHODS, isCheckStatus, wfErrCode } from "@/lib/procurementWorkflow";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const keyOk = (v: string) => /^[a-z][a-z0-9_]*$/.test(v);
const dest = (id: string, tab?: string) => `/staff/procurement/file/${id}${tab ? `?tab=${tab}` : ""}`;

/** Every write goes through a SECURITY DEFINER RPC (role + municipality + transition rules are enforced in the database, not here). */
async function rpc(name: string, args: Record<string, unknown>, id: string, tab?: string) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(name, args);
  if (error) redirect(`${dest(id)}${tab ? `?tab=${tab}&` : "?"}err=${wfErrCode(error)}`);
  revalidatePath(dest(id));
}
const item = (fd: FormData) => { const id = s(fd, "item"); if (!uuidOk(id)) redirect("/staff/procurement?err=bad_input"); return id; };
const bad = (id: string): never => redirect(`${dest(id)}?err=bad_input`);

export async function startFile(fd: FormData) {
  const id = item(fd), m = s(fd, "method");
  if (m && !(WF_METHODS as readonly string[]).includes(m)) bad(id);
  await rpc("procurement_file_start", { p_item: id, p_method: m || null }, id);
}
export async function setCheck(fd: FormData) {
  const id = item(fd), stage = s(fd, "stage"), status = s(fd, "status"), due = s(fd, "due");
  if (!keyOk(stage) || !isCheckStatus(status)) bad(id);
  await rpc("procurement_file_check_set", { p_item: id, p_stage: stage, p_status: status, p_evidence: s(fd, "evidence") || null, p_note: s(fd, "note") || null, p_due: dateOk(due) ? due : null }, id, "checklist");
}
export async function advanceFile(fd: FormData) {
  const id = item(fd), to = s(fd, "to");
  if (!keyOk(to)) bad(id);
  await rpc("procurement_file_advance", { p_item: id, p_to: to, p_note: s(fd, "note") || null }, id);
}
export async function returnFile(fd: FormData) {
  const id = item(fd), to = s(fd, "to");
  if (!keyOk(to)) bad(id);
  await rpc("procurement_file_return", { p_item: id, p_to: to, p_reason: s(fd, "reason") }, id);
}
export async function finishFile(fd: FormData) { const id = item(fd); await rpc("procurement_file_finish", { p_item: id }, id); }
export async function cancelFile(fd: FormData) { const id = item(fd); await rpc("procurement_file_cancel", { p_item: id, p_reason: s(fd, "reason") }, id); }
export async function restartFile(fd: FormData) { const id = item(fd); await rpc("procurement_file_restart", { p_item: id, p_reason: s(fd, "reason") }, id); }
