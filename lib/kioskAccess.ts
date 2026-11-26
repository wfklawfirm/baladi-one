import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

/** Next path allowed after kiosk login: only our own kiosk pages (prevents open redirects). */
export function safeKioskNext(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return /^\/kiosk\/[a-z0-9-]+(\?[A-Za-z0-9=&_%-]*)?$/i.test(s) ? s : "/";
}

/** True when the visitor is signed in AND allowed to view the kiosk (admin, or on the kiosk_viewer list). Any failure means no access. */
export async function kioskAllowed(): Promise<boolean> {
  try {
    if (process.env.KIOSK_OPEN === "1") return true; // explicit escape hatch for a public kiosk
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const { data, error } = await sb.rpc("kiosk_access_allowed");
    return !error && data === true;
  } catch { return false; }
}
