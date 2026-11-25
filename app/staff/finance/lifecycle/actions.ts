"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { parseAmount } from "@/lib/finance";
import { AMEND_TYPES, amendMissing, cycleErrCode, signedDelta, type AmendType } from "@/lib/budgetCycle";

const BASE = "/staff/finance/lifecycle";
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

export async function openCycle(fd: FormData) {
  const y = yearOf(fd); if (!y) return go(fd, "err", "bad_year");
  return call(fd, "budget_cycle_open", { p_year: y }, "opened");
}
export async function advanceCycle(fd: FormData) {
  const y = yearOf(fd), d = date(s(fd, "date")); if (!y) return go(fd, "err", "bad_year"); if (!d) return go(fd, "err", "bad_date");
  return call(fd, "budget_cycle_advance", { p_year: y, p_to: s(fd, "to"), p_date: d, p_decision: uuid(s(fd, "decision")), p_authority: s(fd, "authority") || null, p_session: uuid(s(fd, "session")), p_note: s(fd, "note") || null }, "advanced");
}
export async function saveSettings(fd: FormData) {
  const raw = s(fd, "supp_days"); const days = raw === "" ? null : Number(raw);
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 366)) return go(fd, "err", "bad_input");
  return call(fd, "budget_cycle_settings_set", { p_require: fd.get("require") === "on", p_supp_days: days, p_supp_verified: fd.get("verified") === "on", p_freeze: fd.get("freeze") === "on", p_note: s(fd, "note") || null }, "settings");
}
export async function amendTyped(fd: FormData) {
  const type = s(fd, "type") as AmendType, line = uuid(s(fd, "line")), amount = parseAmount(s(fd, "amount"), { signed: true });
  if (!AMEND_TYPES.includes(type) || type === "transfer") return go(fd, "err", "bad_type");
  if (!line) return go(fd, "err", "line_not_found");
  if (amount === null || signedDelta(type, amount) === null) return go(fd, "err", "bad_amount");
  const miss = amendMissing(type, { reason: s(fd, "reason"), decision: uuid(s(fd, "decision")), funding: s(fd, "funding"), authority: s(fd, "authority"), validatedOn: date(s(fd, "validated")), effectiveOn: date(s(fd, "effective")) });
  if (miss.includes("السبب")) return go(fd, "err", "reason_required");
  if (miss.includes("قرار المجلس")) return go(fd, "err", "decision_required");
  if (miss.includes("مصدر التمويل")) return go(fd, "err", "funding_required");
  if (miss.includes("تاريخ النفاذ")) return go(fd, "err", "effective_date_required");
  if (miss.length) return go(fd, "err", "authority_required");
  return call(fd, "finance_amend_typed", { p_line: line, p_type: type, p_amount: amount, p_reason: s(fd, "reason"), p_decision: uuid(s(fd, "decision")), p_funding: s(fd, "funding") || null, p_authority: s(fd, "authority") || null, p_validated_on: date(s(fd, "validated")), p_effective_on: date(s(fd, "effective")), p_date: date(s(fd, "date")) }, "amended");
}
export async function transferCredit(fd: FormData) {
  const from = uuid(s(fd, "from")), to = uuid(s(fd, "to")), amount = parseAmount(s(fd, "amount"));
  if (!from || !to) return go(fd, "err", "line_not_found");
  if (amount === null || amount === 0) return go(fd, "err", "bad_amount");
  return call(fd, "finance_transfer_credit", { p_from: from, p_to: to, p_amount: amount, p_reason: s(fd, "reason"), p_decision: uuid(s(fd, "decision")), p_authority: s(fd, "authority") || null, p_validated_on: date(s(fd, "validated")), p_effective_on: date(s(fd, "effective")), p_date: date(s(fd, "date")) }, "transferred");
}
export async function validateTyped(fd: FormData) {
  const id = uuid(s(fd, "amendment")), v = date(s(fd, "validated")); if (!id) return go(fd, "err", "not_found"); if (!v) return go(fd, "err", "bad_date");
  return call(fd, "finance_amendment_validate_typed", { p_amendment: id, p_validated_on: v, p_authority: s(fd, "authority") || null }, "validated");
}
export async function releaseSuspension(fd: FormData) {
  const id = uuid(s(fd, "amendment")); if (!id) return go(fd, "err", "not_found");
  return call(fd, "finance_suspension_release", { p_amendment: id, p_note: s(fd, "note") || null }, "released");
}
