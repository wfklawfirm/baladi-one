import "server-only";
import { createClient } from "@supabase/supabase-js";

import { REPORT_TYPES } from "./reports-client";
export { REPORT_TYPES };
export const STATUS_AR: Record<string, string> = {
  received: "تم الاستلام", in_progress: "قيد المعالجة", done: "تمت المعالجة",
  needs_info: "بحاجة إلى معلومات إضافية", rejected: "مرفوض", cancelled: "ملغى",
};
export const reportsEnabled = () => process.env.REPORTS_ENABLED === "1";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("supabase_not_configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SubmitResult = { ok: true; code: string } | { ok: false; error: "invalid" | "rate_limited" | "unavailable" };

export async function submitReport(slug: string, input: { type: string; description: string; location: string; phone: string }): Promise<SubmitResult> {
  try {
    const { data, error } = await db().rpc("submit_report", {
      p_slug: slug, p_type: input.type, p_description: input.description, p_location: input.location || null, p_phone: input.phone || null,
    });
    if (error) return { ok: false, error: error.code === "54000" ? "rate_limited" : error.code === "22023" || error.code === "P0002" ? "invalid" : "unavailable" };
    return { ok: true, code: String(data) };
  } catch { return { ok: false, error: "unavailable" }; }
}

export type Tracked = { status: string; reportType: string; createdAt: string; updatedAt: string; updates: { status: string; note: string | null; at: string }[] };

export async function trackReport(code: string): Promise<Tracked | null> {
  if (code.replace(/[^A-Za-z0-9]/g, "").length !== 12) return null;
  try {
    const { data, error } = await db().rpc("track_report", { p_code: code });
    const r = Array.isArray(data) ? data[0] : null;
    if (error || !r) return null;
    return { status: r.status, reportType: r.report_type, createdAt: r.created_at, updatedAt: r.updated_at, updates: r.updates ?? [] };
  } catch { return null; }
}

export const formatCode = (c: string) => c.replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
