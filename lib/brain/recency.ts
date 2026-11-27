// "Newest first" for every answer that can have several sources: each source gets an issue year read from its own title
// (the highest year named there, so «244/2021 مع تعديلاته 2024» counts as 2024). Sources with no year in the title stay after the dated ones
// and are labelled «التاريخ غير محدد»: the assistant must not assume they are current.
export function issueYear(title: string, fallbackDate?: string | null): number | null {
  const ys = [...title.matchAll(/(?<!\d)(19[5-9]\d|20[0-3]\d)(?!\d)/g)].map((m) => Number(m[1]));
  if (ys.length) return Math.max(...ys);
  const f = fallbackDate && /^\d{4}/.test(fallbackDate) ? Number(fallbackDate.slice(0, 4)) : null;
  return f;
}
export const yearLabel = (y: number | null) => (y ? `سنة الصدور/آخر تعديل: ${y}` : "التاريخ غير محدد");
/** Stable: newest year first, undated last, equal years keep their relevance order. */
export function newestFirst<T>(items: T[], year: (t: T) => number | null): T[] {
  return items.map((t, i) => ({ t, i, y: year(t) })).sort((a, b) => (b.y ?? -1) - (a.y ?? -1) || a.i - b.i).map((x) => x.t);
}
