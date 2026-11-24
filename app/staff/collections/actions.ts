"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export async function recordCollection(fd: FormData) {
  const amount = Number(String(fd.get("amount") ?? "").replace(/[,\s]/g, ""));
  const currency = fd.get("currency") === "USD" ? "USD" : "LBP";
  const method = ["cash", "transfer", "cheque"].includes(String(fd.get("method"))) ? String(fd.get("method")) : "cash";
  if (!Number.isFinite(amount) || amount <= 0) redirect("/staff/collections?err=1");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("record_collection", { p_amount: amount, p_currency: currency, p_method: method, p_service_label: String(fd.get("label") ?? ""), p_receipt_no: String(fd.get("receipt") ?? ""), p_request_id: null });
  redirect(`/staff/collections?${error ? "err=1" : "ok=1"}`);
}
