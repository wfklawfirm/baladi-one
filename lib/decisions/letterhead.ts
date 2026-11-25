import { BRAND } from "@/lib/brand";
import type { DraftData } from "./model";

type Sb = { from: (t: string) => any };
export type Letterhead = { name: string; logo: string | null; fields: Record<string, string> };

/** The municipality's official letterhead from its own register: name (letterhead name if set), governorate, district and its approved logo. Never invented. */
export async function loadLetterhead(sb: Sb, municipalityId: string): Promise<Letterhead> {
  const { data } = await sb.from("municipality").select("slug,name_ar,letterhead_name_ar,logo_url,governorate_ar,district_ar").eq("id", municipalityId).maybeSingle();
  const name = String(data?.letterhead_name_ar || data?.name_ar || "").replace(/^بلدية\s+/, "");
  const logo: string | null = data?.logo_url || (data?.slug === BRAND.slug ? BRAND.logo : null) || null;
  const fields: Record<string, string> = {};
  if (name) fields.municipality = name;
  if (data?.governorate_ar) fields.governorate = data.governorate_ar;
  if (data?.district_ar) fields.district = data.district_ar;
  return { name, logo, fields };
}
/** Register values always win over what was typed earlier, so the letterhead is never stale. */
export const withLetterhead = (d: DraftData, l: Letterhead): DraftData => ({ ...d, ...l.fields });
