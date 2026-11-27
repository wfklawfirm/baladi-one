import { supabaseServer } from "@/lib/supabase-server";
import { csvCell } from "@/lib/trial";

export const dynamic = "force-dynamic";
/** CSV of the trial registry — platform owner only (the RPC enforces it; anyone else gets 403). */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { data, error } = await sb.rpc("trial_leads");
  if (error) return new Response("forbidden", { status: 403 });
  const head = ["name", "phone", "registered_at", "expires_at", "questions", "last_used_at", "status"];
  const lines = [head.join(",")].concat((data as any[]).map((r) => [r.full_name, `+${r.phone}`, r.created_at, r.expires_at, r.question_count, r.last_used_at, r.status].map(csvCell).join(",")));
  return new Response("﻿" + lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="assistant-trial-leads.csv"', "cache-control": "private, no-store" } });
}
