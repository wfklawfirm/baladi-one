"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { errCodeOf, parseAmount } from "@/lib/finance";

const BACK = ["/staff/finance/budget", "/staff/finance/receivables"];
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v) ? v : null;
const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const back = (fd: FormData) => { const b = s(fd, "back"); return BACK.includes(b) ? b : BACK[0]; };
const done = (fd: FormData, ok: string): never => redirect(`${back(fd)}?ok=${ok}`);
const fail = (fd: FormData, code: string): never => redirect(`${back(fd)}?err=${code}`);

async function call(fd: FormData, fn: string, args: Record<string, unknown>, ok: string): Promise<never> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(fn, args);
  if (error) return fail(fd, errCodeOf(error.message));
  return done(fd, ok);
}

export async function addLine(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), year = Number(s(fd, "year"));
  if (amount === null) return fail(fd, "bad_amount");
  if (!Number.isInteger(year)) return fail(fd, "bad_year");
  return call(fd, "finance_add_line", { p_year: year, p_code: s(fd, "code"), p_title: s(fd, "title"), p_kind: s(fd, "kind"), p_sector: s(fd, "sector") || null, p_amount: amount, p_currency: s(fd, "currency") }, "line");
}
export async function amendLine(fd: FormData) {
  const delta = parseAmount(s(fd, "delta"), { signed: true }), line = uuid(s(fd, "line"));
  if (delta === null || delta === 0) return fail(fd, "bad_amount");
  if (!line) return fail(fd, "line_not_found");
  return call(fd, "finance_amend", { p_line: line, p_delta: delta, p_reason: s(fd, "reason"), p_date: date(s(fd, "date")) }, "amend");
}
export async function commitLine(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), line = uuid(s(fd, "line"));
  if (amount === null) return fail(fd, "bad_amount");
  if (!line) return fail(fd, "line_not_found");
  return call(fd, "finance_commit", { p_line: line, p_amount: amount, p_description: s(fd, "description"), p_date: date(s(fd, "date")) }, "commit");
}
export async function payLine(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), line = uuid(s(fd, "line")), paid = date(s(fd, "paid_on"));
  if (amount === null) return fail(fd, "bad_amount");
  if (!line) return fail(fd, "line_not_found");
  if (!paid) return fail(fd, "bad_date");
  return call(fd, "finance_pay", { p_line: line, p_amount: amount, p_paid_on: paid, p_beneficiary: s(fd, "beneficiary"), p_commitment: uuid(s(fd, "commitment")) }, "pay");
}
export async function addReceivable(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), due = date(s(fd, "due_on"));
  if (amount === null) return fail(fd, "bad_amount");
  if (!due) return fail(fd, "bad_date");
  return call(fd, "receivable_add", { p_fee_type: s(fd, "fee_type"), p_amount: amount, p_currency: s(fd, "currency"), p_due_on: due, p_payer_ref: s(fd, "payer_ref") || null }, "recv");
}
export async function settleReceivable(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), id = uuid(s(fd, "receivable"));
  if (amount === null) return fail(fd, "bad_amount");
  if (!id) return fail(fd, "receivable_not_found");
  return call(fd, "receivable_settle", { p_receivable: id, p_amount: amount, p_method: s(fd, "method") || "cash", p_receipt_no: s(fd, "receipt") || null }, "settle");
}
