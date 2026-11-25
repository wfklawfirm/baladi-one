"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { parseAmount } from "@/lib/finance";
import { revenueErrCode } from "@/lib/revenue";

const PAGES = ["/staff/revenue", "/staff/revenue/taxpayers", "/staff/revenue/rules", "/staff/revenue/exemptions", "/staff/revenue/assessments", "/staff/revenue/orders", "/staff/revenue/collect", "/staff/revenue/cash"];
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const back = (fd: FormData) => { const b = s(fd, "back"); return PAGES.includes(b) ? b : PAGES[0]; };
const fail = (fd: FormData, code: string): never => redirect(`${back(fd)}?err=${code}`);

async function call(fd: FormData, fn: string, args: Record<string, unknown>, ok: string): Promise<never> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc(fn, args);
  if (error) return fail(fd, revenueErrCode(error.message));
  return redirect(`${back(fd)}?ok=${ok}`);
}
const num = (fd: FormData, k: string) => { const v = s(fd, k); return v === "" ? null : parseAmount(v); };

export async function addTaxpayer(fd: FormData) { return call(fd, "revenue_taxpayer_add", { p_ref: s(fd, "ref"), p_name: s(fd, "name") || null, p_kind: s(fd, "kind"), p_note: s(fd, "note") || null }, "taxpayer"); }

export async function addRule(fd: FormData) {
  const rate = num(fd, "rate");
  if (s(fd, "rate") !== "" && rate === null) return fail(fd, "bad_amount");
  const from = date(s(fd, "from"));
  if (!from) return fail(fd, "bad_date");
  return call(fd, "revenue_rule_add", { p_fee_type: s(fd, "fee_type"), p_instrument: s(fd, "instrument"), p_instrument_no: s(fd, "instrument_no") || null, p_article: s(fd, "article") || null, p_basis: s(fd, "basis") || null, p_rate: rate, p_rate_unit: rate === null ? null : s(fd, "rate_unit"), p_rate_currency: rate === null ? null : s(fd, "rate_currency"), p_exemptions: s(fd, "exemptions") || null, p_penalties: s(fd, "penalties") || null, p_applicability: s(fd, "applicability") || null, p_source_url: s(fd, "source_url") || null, p_from: from, p_to: date(s(fd, "to")) }, "rule");
}
export async function reviewRule(fd: FormData) { const id = uuid(s(fd, "id")); if (!id) return fail(fd, "not_found"); return call(fd, "revenue_rule_set_review", { p_id: id, p_status: s(fd, "status"), p_note: s(fd, "note") || null }, "review"); }

export async function addSeries(fd: FormData) { return call(fd, "revenue_series_add", { p_code: s(fd, "code"), p_name: s(fd, "name"), p_prefix: s(fd, "prefix") || null }, "series"); }
export async function toggleSeries(fd: FormData) { const id = uuid(s(fd, "id")); if (!id) return fail(fd, "not_found"); return call(fd, "revenue_series_set_active", { p_id: id, p_active: s(fd, "active") === "1" }, "series"); }

export async function addExemption(fd: FormData) {
  const tp = uuid(s(fd, "taxpayer")), from = date(s(fd, "from"));
  if (!tp) return fail(fd, "taxpayer_not_found");
  if (!from) return fail(fd, "bad_date");
  return call(fd, "revenue_exemption_add", { p_taxpayer: tp, p_fee_type: s(fd, "fee_type"), p_reason: s(fd, "reason"), p_instrument: s(fd, "instrument") || null, p_article: s(fd, "article") || null, p_decision: uuid(s(fd, "decision")), p_document_ref: s(fd, "document_ref") || null, p_from: from, p_to: date(s(fd, "to")) }, "exemption");
}
export async function reviewExemption(fd: FormData) { const id = uuid(s(fd, "id")); if (!id) return fail(fd, "not_found"); return call(fd, "revenue_exemption_review", { p_id: id, p_status: s(fd, "status"), p_note: s(fd, "note") }, "exreview"); }

export async function addAssessment(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), tp = uuid(s(fd, "taxpayer")), year = Number(s(fd, "year")), due = date(s(fd, "due_on"));
  if (amount === null) return fail(fd, "bad_amount");
  if (!tp) return fail(fd, "taxpayer_not_found");
  if (!Number.isInteger(year)) return fail(fd, "bad_year");
  if (!due) return fail(fd, "bad_date");
  const bv = s(fd, "basis_value") === "" ? null : parseAmount(s(fd, "basis_value"));
  if (s(fd, "basis_value") !== "" && bv === null) return fail(fd, "bad_amount");
  return call(fd, "revenue_assess", { p_taxpayer: tp, p_fee_type: s(fd, "fee_type"), p_year: year, p_object_ref: s(fd, "object_ref") || null, p_basis_label: s(fd, "basis_label") || null, p_basis_value: bv, p_amount: amount, p_currency: s(fd, "currency"), p_due_on: due, p_decision: uuid(s(fd, "decision")), p_note: s(fd, "note") || null }, "assess");
}
export async function cancelAssessment(fd: FormData) { const id = uuid(s(fd, "id")); if (!id) return fail(fd, "not_found"); return call(fd, "revenue_assessment_cancel", { p_id: id, p_reason: s(fd, "reason") }, "cancel"); }

export async function issueOrder(fd: FormData) { const id = uuid(s(fd, "id")); if (!id) return fail(fd, "not_found"); return call(fd, "revenue_order_issue", { p_assessment: id }, "order"); }
export async function notifyOrder(fd: FormData) { const id = uuid(s(fd, "id")), d = date(s(fd, "date")); if (!id) return fail(fd, "not_found"); if (!d) return fail(fd, "bad_date"); return call(fd, "revenue_order_notify", { p_order: id, p_date: d, p_method: s(fd, "method"), p_proof: s(fd, "proof") }, "notify"); }
export async function cancelOrder(fd: FormData) { const id = uuid(s(fd, "id")); if (!id) return fail(fd, "not_found"); return call(fd, "revenue_order_cancel", { p_order: id, p_reason: s(fd, "reason") }, "cancel"); }
export async function fileObjection(fd: FormData) { const id = uuid(s(fd, "id")), d = date(s(fd, "date")); if (!id) return fail(fd, "not_found"); if (!d) return fail(fd, "bad_date"); return call(fd, "revenue_objection_file", { p_order: id, p_filed_on: d, p_grounds: s(fd, "grounds") }, "objection"); }
export async function resolveObjection(fd: FormData) {
  const id = uuid(s(fd, "id")), outcome = s(fd, "outcome"), corrected = num(fd, "corrected");
  if (!id) return fail(fd, "not_found");
  if (s(fd, "corrected") !== "" && corrected === null) return fail(fd, "bad_amount");
  return call(fd, "revenue_objection_resolve", { p_objection: id, p_outcome: outcome, p_corrected: corrected, p_note: s(fd, "note") }, "resolve");
}

export async function collect(fd: FormData) {
  const amount = parseAmount(s(fd, "amount")), order = uuid(s(fd, "order")), series = uuid(s(fd, "series")), key = s(fd, "key");
  if (amount === null) return fail(fd, "bad_amount");
  if (!order) return fail(fd, "not_found");
  if (!series) return fail(fd, "series_not_found");
  return call(fd, "revenue_collect", { p_order: order, p_amount: amount, p_method: s(fd, "method"), p_series: series, p_key: key, p_date: date(s(fd, "date")) }, "collect");
}
export async function reverseReceipt(fd: FormData) { const id = uuid(s(fd, "id")); if (!id) return fail(fd, "not_found"); return call(fd, "revenue_receipt_reverse", { p_receipt: id, p_reason: s(fd, "reason"), p_document_ref: s(fd, "document_ref") }, "reverse"); }
export async function closeCash(fd: FormData) {
  const counted = parseAmount(s(fd, "counted")), d = date(s(fd, "date"));
  if (counted === null) return fail(fd, "bad_amount");
  if (!d) return fail(fd, "bad_date");
  return call(fd, "revenue_cash_close", { p_date: d, p_currency: s(fd, "currency"), p_counted: counted, p_note: s(fd, "note") || null }, "close");
}
