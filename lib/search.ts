import { normalizeArabic, pick } from "./i18n";
import type { CategoryId, Lang, Service } from "./types";

export function filterServices(services: Service[], query: string, category: CategoryId | "all", lang: Lang): Service[] {
  const q = normalizeArabic(query);
  const words = q.split(/\s+/).filter(Boolean);
  return services.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (!words.length) return true;
    const hay = normalizeArabic(
      [s.title.ar, s.title.en ?? "", s.summary.ar, s.summary.en ?? "", pick(lang, s.authority)].join(" "),
    );
    return words.every((w) => hay.includes(w));
  });
}
