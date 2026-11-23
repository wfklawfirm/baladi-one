"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Exhibition entry: signs in with a restricted demo account whose credentials live only in server env vars.
 * Demo accounts can only see/change demo requests (RLS); real accounts always use /staff/login.
 */
export async function enterDemo(role: "staff" | "mayor") {
  const k = role === "mayor" ? "DEMO_MAYOR" : "DEMO_STAFF";
  const email = process.env[`${k}_EMAIL`], password = process.env[`${k}_PASSWORD`];
  if (!email || !password) redirect("/staff/login");
  const sb = await supabaseServer();
  await sb.auth.signOut();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  redirect(error ? "/staff/login?error=1" : "/staff");
}
