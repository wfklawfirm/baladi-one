/** Awaits a Supabase query and never throws: a missing table/column (migration not applied) yields empty data with missing=true. */
export async function safe<T>(q: PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>): Promise<{ data: T[]; missing: boolean }> {
  try {
    const { data, error } = await q;
    if (error) return { data: [], missing: true };
    return { data: data ?? [], missing: false };
  } catch { return { data: [], missing: true }; }
}
export const fld = "min-h-10 rounded-xl border-2 bg-background px-2";
export const btn = "min-h-10 rounded-xl border px-4 text-sm font-semibold active:bg-muted";
export const money = (n: number | string | null, c: string) => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("en-US")} ${c === "LBP" ? "ل.ل." : "$"}`);
