"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";
import { seedPayload } from "@/lib/decisions/seed";
import { blocksToText, renderDecision } from "@/lib/decisions/render";
import { errText } from "@/lib/decisions/errors";
import type { DraftData, TemplateContent } from "@/lib/decisions/model";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const code = (e: { message?: string } | null) => (e?.message ?? "").split(":")[0].trim();

// ---------- library ----------
export async function createFromTemplate(fd: FormData) {
  const v = s(fd, "version"), sess = s(fd, "session");
  if (!uuidOk(v)) redirect("/staff/decisions?err=1");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("decision_builder_create", { p_version: v, p_session: uuidOk(sess) ? sess : null, p_title: null, p_data: {} });
  if (error || !data) redirect(`/staff/decisions?err=${encodeURIComponent(code(error) || "1")}`);
  redirect(`/staff/decisions/${data}`);
}

export async function importSeed() {
  const sb = await supabaseServer();
  const p = seedPayload();
  let n = 0;
  for (let i = 0; i < p.items.length; i += 20) {
    const { data, error } = await sb.rpc("dt_import", { p_sources: i === 0 ? p.sources : [], p_items: p.items.slice(i, i + 20) });
    if (error) redirect(`/staff/decisions/templates?err=${encodeURIComponent(code(error))}`);
    n += Number(data ?? 0);
  }
  revalidatePath("/staff/decisions"); revalidatePath("/staff/decisions/templates");
  redirect(`/staff/decisions/templates?imported=${n}`);
}

// ---------- templates ----------
export async function saveTemplate(fd: FormData) {
  const id = s(fd, "id"), back = (m: string) => `/staff/decisions/templates/${uuidOk(id) ? id : "new"}?${m}`;
  let content: TemplateContent;
  try { content = JSON.parse(s(fd, "content")); } catch { redirect(back("err=json")); }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("dt_save", { p_id: uuidOk(id) ? id : null, p_template_id: s(fd, "template_id") || null, p_version: s(fd, "version"), p_content: content });
  if (error || !data) redirect(back(`err=${encodeURIComponent(code(error) || "1")}`));
  revalidatePath("/staff/decisions/templates");
  redirect(`/staff/decisions/templates/${data}?saved=1`);
}
export async function reviewTemplate(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) redirect("/staff/decisions/templates");
  const eff = s(fd, "effective");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("dt_review", { p_id: id, p_to: s(fd, "to"), p_note: s(fd, "note") || null, p_effective: dateOk(eff) ? eff : null });
  revalidatePath("/staff/decisions/templates"); revalidatePath(`/staff/decisions/templates/${id}`);
  redirect(`/staff/decisions/templates/${id}?${error ? `err=${encodeURIComponent(code(error))}` : "reviewed=1"}`);
}
export async function setSourceDate(fd: FormData) {
  const eff = s(fd, "effective");
  const sb = await supabaseServer();
  if (dateOk(eff)) await sb.rpc("dt_set_source_date", { p_source: s(fd, "source"), p_effective: eff });
  revalidatePath("/staff/decisions/templates");
}
export async function setLegalProfile(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("muni_set_legal_profile", { p_governorate: s(fd, "governorate"), p_district: s(fd, "district"), p_note: s(fd, "note") || null, p_verified: fd.get("verified") === "on" });
  revalidatePath("/staff/decisions");
  redirect(`/staff/decisions/templates?${error ? `err=${encodeURIComponent(code(error))}` : "profile=1"}`);
}

// ---------- editor ----------
export type Result = { ok: boolean; error?: string; rev?: number };
export async function saveBuilder(id: string, title: string, data: DraftData): Promise<Result> {
  if (!uuidOk(id)) return { ok: false, error: "bad_input" };
  const sb = await supabaseServer();
  const { data: d } = await sb.from("municipal_decision").select("template_snapshot").eq("id", id).maybeSingle();
  if (!d?.template_snapshot) return { ok: false, error: "not_found" };
  const text = blocksToText(renderDecision({ snap: d.template_snapshot as TemplateContent, data, title, mode: "draft" }));
  const { data: rev, error } = await sb.rpc("decision_builder_save", { p_id: id, p_title: title, p_body: text, p_data: data, p_legal_basis: ((data.selected_refs ?? []) as { source_id: string; article: string }[]).map((r) => `${r.source_id}:${r.article}`).join("؛") || null });
  if (error) return { ok: false, error: errText(error) };
  revalidatePath(`/staff/decisions/${id}`);
  return { ok: true, rev: Number(rev) };
}
export async function adoptBuilder(id: string, date: string): Promise<Result> {
  if (!uuidOk(id) || !dateOk(date)) return { ok: false, error: "تحقق من التاريخ." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("decision_builder_adopt", { p_id: id, p_date: date });
  if (error) return { ok: false, error: errText(error) };
  revalidatePath(`/staff/decisions/${id}`); revalidatePath("/staff/council/decisions");
  return { ok: true };
}
export async function setBuilderReview(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) redirect("/staff/decisions");
  const sb = await supabaseServer();
  const { data: d } = await sb.from("municipal_decision").select("sent_on,received_on,validated_on,validation_note,audit_bureau_required,audit_bureau_notice_on,tacit_notified_on").eq("id", id).maybeSingle();
  if (d) await sb.rpc("decision_set_review", { p_id: id, p_category: s(fd, "category"), p_level: s(fd, "level"), p_sent: d.sent_on, p_received: d.received_on, p_validated: d.validated_on, p_note: d.validation_note, p_audit_required: d.audit_bureau_required, p_audit_notice: d.audit_bureau_notice_on, p_tacit_notified: d.tacit_notified_on });
  revalidatePath(`/staff/decisions/${id}`);
  redirect(`/staff/decisions/${id}`);
}
export async function setRegisterDates(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) redirect("/staff/decisions");
  const pub = s(fd, "published"), not = s(fd, "notified");
  const sb = await supabaseServer();
  await sb.rpc("decision_set_register", { p_id: id, p_published: dateOk(pub) ? pub : null, p_notified: dateOk(not) ? not : null });
  revalidatePath(`/staff/decisions/${id}`);
  redirect(`/staff/decisions/${id}`);
}

export async function bulkApprove(fd: FormData) {
  const ids = fd.getAll("ids").map(String).filter(uuidOk);
  const eff = s(fd, "effective"), note = s(fd, "note");
  if (fd.get("confirm") !== "on" || !ids.length || !dateOk(eff) || !note) redirect("/staff/decisions/templates?err=bad_input");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("dt_review_bulk", { p_ids: ids, p_note: note, p_effective: eff });
  revalidatePath("/staff/decisions"); revalidatePath("/staff/decisions/templates");
  redirect(`/staff/decisions/templates?${error ? `err=${encodeURIComponent(code(error))}` : `approved=${Number(data ?? 0)}`}`);
}
