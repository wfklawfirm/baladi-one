// Claim-level verification and a deterministic confidence engine. The model never self-reports confidence: levels come from evidence metadata and claim audit results.
export type Level = "low" | "medium" | "high";
export type ClaimStatus = "supported" | "unreviewed" | "inference" | "insufficient" | "conflict";
export type Claim = { text: string; status: ClaimStatus; source: string; categorical: boolean };
export type AuthMeta = { title: string; kind: string; kindAr: string; rank: number; year: number | null; url: string; quality: string | null; status: "pending_review" | "verified" | "rejected" | "superseded"; excerpt: string; category: string };

export const CLAIMS_SYSTEM = `أنت مدقق قانوني صارم. تُعطى «نصوصًا» و«جوابًا». استخرج كل ادعاء قانوني جوهري في الجواب (حكم/استثناء/مهلة/صلاحية/رقم مادة) وصنّفه بحقل support:
- "explicit": يؤيده نص صريح من النصوص المعطاة. 
- "inference": استنتاج من الربط بين عدة نصوص أو من نص غير مباشر.
- "none": لا يسنده أي نص معطى.
- "conflict": يناقضه نص معطى.
أعد JSON فقط: {"claims":[{"text":"…","support":"explicit|inference|none|conflict","source":"عنوان النص المؤيد كما ورد بالضبط أو فارغ","categorical":true|false}]}. categorical=true إن كان الادعاء قاطعًا (يجوز/لا يجوز/يحق/محظور). لا تضف ادعاءات غير واردة في الجواب.`;

export function parseClaims(raw: string, docs: AuthMeta[]): Claim[] | null {
  try {
    const j = JSON.parse(raw); if (!Array.isArray(j.claims)) return null;
    return j.claims.slice(0, 30).map((c: any): Claim => {
      const doc = docs.find((d) => c?.source && String(c.source).includes(d.title.slice(0, 30)));
      const s = String(c?.support);
      const status: ClaimStatus = s === "conflict" ? "conflict" : s === "none" ? "insufficient" : s === "inference" ? "inference" : s === "explicit" ? (doc?.status === "verified" ? "supported" : "unreviewed") : "insufficient";
      return { text: String(c?.text ?? "").slice(0, 300), status, source: doc?.title ?? String(c?.source ?? "").slice(0, 120), categorical: c?.categorical === true };
    });
  } catch { return null; }
}
/** Claims that must trigger regeneration: contradiction, or a categorical claim with no support. */
export const blockingClaims = (cs: Claim[]) => cs.filter((c) => c.status === "conflict" || (c.status === "insufficient" && c.categorical));

const ORD: Level[] = ["low", "medium", "high"];
const min = (a: Level[]): Level => a.reduce((m, x) => (ORD.indexOf(x) < ORD.indexOf(m) ? x : m), "high" as Level);
export type ConfidenceReport = { extraction: Level; inference: Level; in_force: Level; overall: Level };
export function computeConfidence(docs: AuthMeta[], claims: Claim[] | null): ConfidenceReport {
  const cited = claims ? docs.filter((d) => claims.some((c) => c.source === d.title)) : [];
  const used = cited.length ? cited : docs;
  const extraction: Level = !used.length ? "low" : min(used.map((d): Level => (d.quality === "text" ? "high" : d.quality === "ocr" || d.quality === "ocr+text" ? "low" : "medium")));
  let inference: Level = "low";
  if (claims) inference = !claims.length ? "medium" : claims.some((c) => c.status === "conflict" || c.status === "insufficient") ? "low" : claims.some((c) => c.status === "inference") ? "medium" : "high";
  const in_force: Level = !used.length ? "low" : min(used.map((d): Level => d.status === "verified" ? "high" : d.status === "pending_review" ? (d.rank >= 7 ? "low" : "medium") : "low"));
  return { extraction, inference, in_force, overall: min([extraction, inference, in_force]) };
}
export const LEVEL_AR: Record<Level, string> = { low: "منخفضة", medium: "متوسطة", high: "مرتفعة" };
