"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { cycleErrCode } from "@/lib/budgetCycle";

const BASE = "/staff/finance/closing";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const yearOf = (fd: FormData) => { const y = Number(s(fd, "year")); return Number.isInteger(y) && y >= 1990 && y <= 2100 ? y : null; };
const go = (fd: FormData, key: "ok" | "err", v: string): never => { const y = yearOf(fd); redirect(`${BASE}?${y ? `fy=${y}&` : ""}${key}=${v}`); };
async function call(fd: FormData, fn: string, args: Record<string, unknown>, ok: string): Promise<never> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(fn, args);
  if (error) return go(fd, "err", cycleErrCode(error.message));
  return go(fd, "ok", ok);
}

export async function startClosing(fd: FormData) {
  const y = yearOf(fd); if (!y) return go(fd, "err", "bad_year");
  const ye = s(fd, "year_end");
  if (ye && !date(ye)) return go(fd, "err", "bad_date");
  return call(fd, "closing_start", { p_year: y, p_year_end: ye || null, p_note: s(fd, "note") || null }, "started");
}
export async function setSupplementary(fd: FormData) {
  const y = yearOf(fd); if (!y) return go(fd, "err", "bad_year");
  const raw = s(fd, "days"), days = raw === "" ? null : Number(raw), ends = s(fd, "ends_on");
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 366)) return go(fd, "err", "bad_input");
  if (ends && !date(ends)) return go(fd, "err", "bad_date");
  if (days === null && !ends) return go(fd, "err", "bad_input");
  return call(fd, "closing_set_supplementary", { p_year: y, p_days: days, p_ends_on: ends || null, p_verified: fd.get("verified") === "on", p_note: s(fd, "note") || null }, "supp");
}
export async function resolveCommitment(fd: FormData) {
  const id = uuid(s(fd, "commitment")); if (!id) return go(fd, "err", "commitment_not_found");
  return call(fd, "closing_resolve_commitment", { p_commitment: id, p_resolution: s(fd, "resolution"), p_decision: uuid(s(fd, "decision")), p_note: s(fd, "note") || null }, "resolved");
}
export async function recordFinalAccount(fd: FormData) {
  const y = yearOf(fd), dec = uuid(s(fd, "decision")), prep = date(s(fd, "prepared_on")); if (!y) return go(fd, "err", "bad_year"); if (!dec) return go(fd, "err", "decision_required"); if (!prep) return go(fd, "err", "bad_date");
  const val = s(fd, "validated_on"); if (val && !date(val)) return go(fd, "err", "bad_date");
  return call(fd, "closing_record_final_account", { p_year: y, p_decision: dec, p_prepared_on: prep, p_ref: s(fd, "ref") || null, p_validated_on: val || null, p_authority: s(fd, "authority") || null }, "final");
}
export async function closeYear(fd: FormData) {
  const y = yearOf(fd); if (!y) return go(fd, "err", "bad_year");
  if (fd.get("confirm") !== "on") return go(fd, "err", "bad_input");
  return call(fd, "closing_close", { p_year: y, p_note: s(fd, "note") || null }, "closed");
}
export async function reopenYear(fd: FormData) {
  const y = yearOf(fd), dec = uuid(s(fd, "decision")); if (!y) return go(fd, "err", "bad_year"); if (!dec) return go(fd, "err", "decision_required");
  if (fd.get("confirm") !== "on") return go(fd, "err", "bad_input");
  return call(fd, "closing_reopen", { p_year: y, p_reason: s(fd, "reason"), p_decision: dec, p_authority: s(fd, "authority") || null }, "reopened");
}
