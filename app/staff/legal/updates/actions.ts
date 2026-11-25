"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";
import { errCode } from "@/lib/votes";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const BACK = "/staff/legal/updates";
const fail = (e: string): never => redirect(`${BACK}?err=${e}`);

export async function addLegalUpdate(fd: FormData) {
  if (!s(fd, "source") || !s(fd, "summary") || !dateOk(s(fd, "received_on"))) fail("1");
  const affected = fd.getAll("affected").map(String).filter(Boolean);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("legal_update_add", { p_source: s(fd, "source"), p_received_on: s(fd, "received_on"), p_summary: s(fd, "summary"), p_affected: affected });
  if (error) fail(errCode(error.message));
  revalidatePath(BACK); redirect(`${BACK}?ok=added`);
}
/** Records the decision on an update. It never edits legal_rule. */
export async function reviewLegalUpdate(fd: FormData) {
  const id = s(fd, "id"), st = s(fd, "status"); if (!uuidOk(id) || !["under_review", "approved", "rejected"].includes(st)) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("legal_update_review", { p_id: id, p_status: st, p_note: s(fd, "note") || null });
  if (error) fail(errCode(error.message));
  revalidatePath(BACK); redirect(`${BACK}?ok=reviewed`);
}
export async function reviewRule(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("legal_rule_review", { p_rule_id: s(fd, "rule"), p_status: s(fd, "status"), p_note: s(fd, "note") });
  if (error) fail(errCode(error.message));
  revalidatePath(BACK); revalidatePath("/staff/legal"); redirect(`${BACK}?ok=rule`);
}
