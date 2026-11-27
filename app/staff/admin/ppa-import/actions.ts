"use server";
import { requireStaff } from "@/lib/supabase-server";
import docs from "@/data/ppa_docs.json";

/** Platform-owner only (the database RPC refuses everyone else). Imports the bundled PPA texts; every row is stored as pending_review. */
export async function importPpa(_: unknown, fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const { sb } = await requireStaff();
  const { data: owner } = await sb.rpc("is_platform_owner");
  if (owner !== true) return { ok: false, msg: "هذه العملية لحساب المالك فقط." };
  if (fd.get("confirm") !== "yes") return { ok: false, msg: "أكّد الاستيراد أولًا." };
  let chunks = 0, done = 0; const failed: number[] = [];
  for (const d of docs as { page_id: number; chunks: unknown[] }[]) {
    const { data, error } = await sb.rpc("procurement_doc_import", { p_doc: d });
    if (error) failed.push(d.page_id); else { done++; chunks += Number(data ?? 0); }
  }
  return failed.length ? { ok: false, msg: `استُورد ${done} من ${docs.length} (${chunks} مقطعًا). فشل: ${failed.join("، ")}.` } : { ok: true, msg: `تم استيراد ${done} مستندًا (${chunks} مقطعًا) بحالة «قيد المراجعة».` };
}
