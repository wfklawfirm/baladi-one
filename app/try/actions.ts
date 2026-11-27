"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { newToken } from "@/lib/trialServer";
import { TRIAL_COOKIE, TRIAL_DAYS, normalizePhone } from "@/lib/trial";

export async function registerTrial(fd: FormData) {
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  if (!phone) redirect("/try?err=bad_phone");
  if (fd.get("consent") !== "on") redirect("/try?err=consent");
  const { token, hash } = newToken();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("trial_register", { p_phone: phone, p_name: name || null, p_consent: true, p_token_hash: hash });
  if (error) redirect(`/try?err=${/busy/.test(error.message) ? "busy" : /bad_phone/.test(error.message) ? "bad_phone" : "failed"}`);
  if ((data as { status?: string } | null)?.status !== "ok") redirect("/try?err=expired");
  (await cookies()).set(TRIAL_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TRIAL_DAYS * 86400 });
  redirect("/try/assistant");
}
