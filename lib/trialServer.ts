import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { TRIAL_COOKIE } from "./trial";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => { const token = randomBytes(32).toString("base64url"); return { token, hash: hashToken(token) }; };

/** Trial state for the current visitor's cookie (checked in the database; the cookie only carries a random token). */
export async function readTrial(): Promise<{ status: "ok" | "expired" | "invalid"; expiresAt?: string; hash?: string }> {
  const t = (await cookies()).get(TRIAL_COOKIE)?.value;
  if (!t || t.length < 20 || t.length > 100) return { status: "invalid" };
  const hash = hashToken(t);
  const sb = await supabaseServer();
  const { data } = await sb.rpc("trial_status", { p_token_hash: hash });
  const st = (data as { status?: string; expires_at?: string } | null) ?? {};
  return st.status === "ok" ? { status: "ok", expiresAt: st.expires_at, hash } : { status: st.status === "expired" ? "expired" : "invalid" };
}
