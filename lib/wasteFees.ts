import raw from "@/data/waste_fee_bands.json";

export type FeeBand = { key: string; label: string; min_pct: number; max_pct: number };
/** Bands transcribed from القانون 38/2026 (م.28 بند 6-ب). Percent of the official private-sector minimum wage, per month. Not verified by a lawyer. */
export const FEE_BANDS = raw.bands as FeeBand[];
export const FEE_BANDS_META = { source: raw.source, basis: raw.basis, verified: raw.verified, note: raw.note };

/** Parses a user-entered wage (Arabic or Latin digits, optional separators). Returns null if not a positive number. No default value is ever assumed. */
export function parseWage(input: string | undefined | null): number | null {
  if (!input) return null;
  const ascii = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,٬\s]/g, "");
  const n = Number(ascii);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Monthly bounds in currency units for a band, given the current minimum wage entered by the user. */
export function monthlyBounds(band: FeeBand, wage: number): { min: number; max: number } {
  return { min: Math.round((wage * band.min_pct) / 100), max: Math.round((wage * band.max_pct) / 100) };
}

/** A fee chosen by the council must stay inside the legal bounds. */
export function withinBounds(band: FeeBand, wage: number, monthly: number): boolean {
  const b = monthlyBounds(band, wage);
  return monthly >= b.min && monthly <= b.max;
}
