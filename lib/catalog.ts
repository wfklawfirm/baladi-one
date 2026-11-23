import "server-only";
import { createClient } from "@supabase/supabase-js";
import demo from "@/data/demo_services.json";
import type { Municipality, Service } from "./types";

const DEMO_MUNI: Municipality = { slug: "demo", nameAr: "بلدية تجريبية", nameEn: "Demo Municipality", isDemo: true };

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function loadMunicipality(slug: string): Promise<Municipality | null> {
  const c = db();
  if (c) {
    const { data } = await c.from("municipality").select("slug,name_ar,name_en,logo_url,is_demo").eq("slug", slug).maybeSingle();
    if (data) return { slug: data.slug, nameAr: data.name_ar, nameEn: data.name_en ?? undefined, logoUrl: data.logo_url ?? undefined, isDemo: data.is_demo };
  }
  return slug === "demo" ? DEMO_MUNI : null;
}

/** Approved, in-scope services only (enforced by RLS). Falls back to labelled DEMO content only when BALADI_DEMO=1. */
export async function loadCatalog(): Promise<{ services: Service[]; demo: boolean }> {
  const c = db();
  if (c) {
    const { data, error } = await c
      .from("municipal_service")
      .select("slug,category,online_enabled,sort_order,service_version!inner(title_ar,title_en,summary_ar,summary_en,documents,steps,authority_ar,fees,processing_time_ar,reviewed_on,status,service_source(title,url))")
      .eq("service_version.status", "approved")
      .order("sort_order");
    if (!error && data && data.length) {
      return {
        demo: false,
        services: data.map((r: any) => {
          const v = Array.isArray(r.service_version) ? r.service_version[0] : r.service_version;
          return {
            slug: r.slug, category: r.category, onlineEnabled: r.online_enabled,
            title: { ar: v.title_ar, en: v.title_en ?? undefined },
            summary: { ar: v.summary_ar ?? "", en: v.summary_en ?? undefined },
            documents: v.documents ?? [], steps: v.steps ?? [],
            authority: v.authority_ar ? { ar: v.authority_ar } : undefined,
            processingTime: v.processing_time_ar ? { ar: v.processing_time_ar } : undefined,
            fees: v.fees ?? undefined,
            sources: (v.service_source ?? []).map((s: any) => ({ title: s.title, url: s.url ?? undefined })),
            reviewedOn: v.reviewed_on ?? undefined, demo: false,
          } satisfies Service;
        }),
      };
    }
  }
  if (process.env.BALADI_DEMO === "1") return { services: demo as unknown as Service[], demo: true };
  return { services: [], demo: false };
}
