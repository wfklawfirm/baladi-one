"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";

/** Owner-only (the RPC refuses everyone else). The AI never calls this; a person sets the status after comparing with the original. */
export async function reviewDoc(fd: FormData) {
  const { sb } = await requireStaff();
  const { data: owner } = await sb.rpc("is_platform_owner");
  if (owner !== true) redirect("/staff");
  const page = Number(fd.get("page_id")), status = String(fd.get("status")), note = String(fd.get("note") ?? "").trim();
  const back = String(fd.get("back") ?? "/staff/admin/ppa-review").startsWith("/staff/admin/ppa-review") ? String(fd.get("back")) : "/staff/admin/ppa-review";
  const sep = back.includes("?") ? "&" : "?";
  if (!Number.isInteger(page) || (status !== "pending_review" && fd.get("compared") !== "yes")) redirect(`${back}${sep}msg=${encodeURIComponent("أكّد أنك قارنت النص بالأصل")}`);
  const { error } = await sb.rpc("procurement_doc_review", { p_page_id: page, p_status: status, p_note: note });
  const m = error ? (error.message.includes("note_required") ? "الملاحظة إلزامية (10 أحرف على الأقل)" : error.message.includes("no_text_to_verify") ? "لا نص مقروء لهذا المستند فلا يُعتمد" : "تعذّر الحفظ") : "تم حفظ الحالة وتسجيلها";
  redirect(`${back}${sep}msg=${encodeURIComponent(m)}`);
}
