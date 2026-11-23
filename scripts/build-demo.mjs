// Builds data/demo_services.json from the raw DALILAK records.
// Output is DEMO-ONLY: it is never inserted as approved content and fees are deliberately omitted
// (no verified source). Run: node scripts/build-demo.mjs
import fs from "node:fs";
const raw = JSON.parse(fs.readFileSync(new URL("../data/dalilak_municipal_raw.json", import.meta.url), "utf8"));
const category = { "mun-001": "licenses", "mun-002": "certificates", "mun-003": "shops", "mun-004": "public_works", "mun-005": "certificates", "proc-001": "certificates" };
const out = raw.map((r, i) => ({
  slug: r.slug,
  category: category[r.slug],
  onlineEnabled: false,
  title: { ar: r.name_ar, en: r.name_en },
  summary: { ar: r.description, en: r.description_en },
  documents: r.required_documents.map((d, k) => ({ ar: d, en: r.required_documents_en?.[k] })),
  steps: [],
  authority: { ar: r.authority_ar, en: r.authority_en },
  processingTime: r.processing_time ? { ar: r.processing_time, en: r.processing_time_en } : undefined,
  sources: [{ title: "دليلك (DALILAK) — قيد التدقيق" }],
  demo: true,
  sort: i,
}));
fs.writeFileSync(new URL("../data/demo_services.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("demo services:", out.length);
