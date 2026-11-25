import { createClient } from "@supabase/supabase-js";
import { BRAND } from "@/lib/brand";
import { DEFAULT_DISPLAY, normalizeIdle } from "@/lib/brand-motion";

/** Public, non-sensitive display settings (screensaver on/off + idle seconds). Falls back to defaults when unset or the table is missing. */
export async function GET() {
  let out = { ...DEFAULT_DISPLAY };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const c = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await c.from("display_setting").select("screensaver_enabled,idle_seconds,screensaver_qr,municipality!inner(slug)").eq("municipality.slug", BRAND.slug).maybeSingle();
      if (data) out = { enabled: data.screensaver_enabled !== false, idleSeconds: normalizeIdle(data.idle_seconds), qr: data.screensaver_qr !== false };
    } catch { /* defaults */ }
  }
  return Response.json(out, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
