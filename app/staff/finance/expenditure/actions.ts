"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { parseAmount } from "@/lib/finance";
import { expCodeOf, parseRate } from "@/lib/expenditure";

const ROOT = "/staff/finance/expenditure";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const back = (fd: FormData) => { const b = s(fd, "back"); return b === ROOT || b === `${ROOT}/settings` || new RegExp(`^${ROOT}/[0-9a-f-]{36}$`, "i").test(b) ? b : ROOT; };
const fail = (fd: FormData, code: string): never => redirect(`${back(fd)}?err=${code}`);
const done = (fd: FormData, ok: string): never => redirect(`${back(fd)}?ok=${ok}`);

async function call(fd: FormData, fn: string, args: Record<string, unknown>, ok: string): Promise<never> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(fn, args);
  if (error) return fail(fd, /could not find the function|schema cache/i.test(error.message) ? "not_active" : expCodeOf(error.message));
  return done(fd, ok);
}
/** Common money fields: amount + document currency + optional documented rate. Returns the RPC arg subset or a redirect. */
function money(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), cur = s(fd, "doc_currency");
  if (amount === null || amount <= 0) return fail(fd, "bad_amount");
  if (cur !== "LBP" && cur !== "USD") return fail(fd, "bad_currency");
  const rawRate = s(fd, "rate"), rate = rawRate ? parseRate(rawRate) : null;
  if (rawRate && rate === null) return fail(fd, "rate_required");
  return { p_doc_amount: amount, p_doc_currency: cur, p_rate: rate, p_rate_date: date(s(fd, "rate_date")), p_rate_source: s(fd, "rate_source") || null };
}
const key = (fd: FormData) => s(fd, "key");

export async function commit(fd: FormData) {
  const line = uuid(s(fd, "line")); if (!line) return fail(fd, "line_not_found");
  const m = money(fd);
  return call(fd, "exp_commit", { p_line: line, ...m, p_description: s(fd, "description"), p_basis_ref: s(fd, "basis_ref"), p_idempotency_key: key(fd), p_decision: uuid(s(fd, "decision")), p_contract: uuid(s(fd, "contract")), p_date: date(s(fd, "date")) }, "commit");
}
export async function liquidate(fd: FormData) {
  const c = uuid(s(fd, "commitment")); if (!c) return fail(fd, "commitment_not_found");
  const m = money(fd);
  return call(fd, "exp_liquidate", { p_commitment: c, ...m, p_invoice_no: s(fd, "invoice_no"), p_invoice_date: date(s(fd, "invoice_date")), p_evidence_ref: s(fd, "evidence_ref"), p_delivery_ref: s(fd, "delivery_ref"), p_idempotency_key: key(fd), p_delivered_on: date(s(fd, "delivered_on")), p_note: s(fd, "note") || null }, "liquidate");
}
export async function order(fd: FormData) {
  const l = uuid(s(fd, "liquidation")); if (!l) return fail(fd, "liquidation_required");
  const m = money(fd);
  return call(fd, "exp_order", { p_liquidation: l, ...m, p_beneficiary: s(fd, "beneficiary"), p_idempotency_key: key(fd), p_order_date: date(s(fd, "order_date")), p_note: s(fd, "note") || null }, "order");
}
export async function orderExceptional(fd: FormData) {
  const e = uuid(s(fd, "exception")); if (!e) return fail(fd, "exception_not_found");
  const m = money(fd);
  return call(fd, "exp_order_exceptional", { p_exception: e, ...m, p_beneficiary: s(fd, "beneficiary"), p_idempotency_key: key(fd), p_order_date: date(s(fd, "order_date")), p_note: s(fd, "note") || null }, "order_x");
}
export async function pay(fd: FormData) {
  const o = uuid(s(fd, "order")); if (!o) return fail(fd, "order_required");
  const paid = date(s(fd, "paid_on")); if (!paid) return fail(fd, "bad_date");
  const m = money(fd);
  return call(fd, "exp_pay", { p_order: o, ...m, p_method: s(fd, "method"), p_paid_on: paid, p_proof_ref: s(fd, "proof_ref"), p_idempotency_key: key(fd), p_note: s(fd, "note") || null }, "pay");
}
export async function reconcile(fd: FormData) {
  const p = uuid(s(fd, "payment")); if (!p) return fail(fd, "payment_not_found");
  const amount = parseAmount(s(fd, "amount")), d = date(s(fd, "statement_date"));
  if (amount === null) return fail(fd, "bad_amount");
  if (!d) return fail(fd, "statement_required");
  return call(fd, "exp_reconcile", { p_payment: p, p_statement_ref: s(fd, "statement_ref"), p_statement_date: d, p_statement_amount: amount, p_statement_currency: s(fd, "doc_currency"), p_note: s(fd, "note") || null }, "reconcile");
}
export async function reverse(fd: FormData) {
  const id = uuid(s(fd, "id")), kind = s(fd, "kind");
  if (!id) return fail(fd, "not_found");
  const raw = s(fd, "amount"), amount = raw ? parseAmount(raw) : null;
  if (raw && amount === null) return fail(fd, "bad_amount");
  return call(fd, "exp_reverse", { p_kind: kind, p_id: id, p_amount: amount, p_reason: s(fd, "reason"), p_idempotency_key: key(fd) }, "reverse");
}
export async function assign(fd: FormData) {
  const u = uuid(s(fd, "user")); if (!u) return fail(fd, "user_not_staff");
  return call(fd, "exp_assign", { p_user: u, p_fn: s(fd, "fn"), p_basis: s(fd, "basis") || null, p_note: s(fd, "note") || null }, "assign");
}
export async function unassign(fd: FormData) {
  const a = uuid(s(fd, "assignment")); if (!a) return fail(fd, "not_found");
  return call(fd, "exp_unassign", { p_assignment: a }, "unassign");
}
export async function setEnforcement(fd: FormData) {
  return call(fd, "exp_set_enforcement", { p_on: s(fd, "on") === "1", p_reason: s(fd, "reason") }, "enforce");
}
export async function declareException(fd: FormData) {
  const line = uuid(s(fd, "line")), amount = parseAmount(s(fd, "amount"));
  if (!line) return fail(fd, "line_not_found");
  if (amount === null || amount <= 0) return fail(fd, "bad_amount");
  return call(fd, "exp_declare_exception", { p_line: line, p_commitment: uuid(s(fd, "commitment")), p_scope: s(fd, "scope"), p_amount: amount, p_justification: s(fd, "justification"), p_reference: s(fd, "reference") }, "exception");
}
export async function declareSodException(fd: FormData) {
  const line = uuid(s(fd, "line")), user = uuid(s(fd, "user"));
  if (!line) return fail(fd, "line_not_found");
  if (!user) return fail(fd, "user_not_staff");
  return call(fd, "exp_declare_sod_exception", { p_line: line, p_commitment: uuid(s(fd, "commitment")), p_user: user, p_justification: s(fd, "justification"), p_reference: s(fd, "reference") }, "sod");
}
