"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (v: string) => (v ? v : null);
const optDate = (v: string) => (dateOk(v) ? v : null);
const optInt = (v: string) => (/^\d{1,5}$/.test(v) ? Number(v) : null);

export async function createSession(fd: FormData) {
  const sb = await supabaseServer();
  const date = s(fd, "held_on");
  if (!s(fd, "title") || !dateOk(date)) redirect("/staff/council?err=1");
  const { data, error } = await sb.rpc("council_create_session", { p_title: s(fd, "title"), p_held_on: date, p_no: opt(s(fd, "no")) });
  if (error || !data) redirect("/staff/council?err=1");
  redirect(`/staff/council/${data}`);
}
export async function addAgenda(fd: FormData) {
  const id = s(fd, "session"); if (!uuidOk(id) || !s(fd, "title")) redirect(`/staff/council`);
  const sb = await supabaseServer();
  await sb.rpc("council_add_agenda", { p_session: id, p_title: s(fd, "title"), p_desc: opt(s(fd, "desc")) });
  revalidatePath(`/staff/council/${id}`);
}
export async function setSession(fd: FormData) {
  const id = s(fd, "session"); if (!uuidOk(id)) return;
  const st = s(fd, "status"), minutes = fd.has("minutes") ? s(fd, "minutes") : null;
  const sb = await supabaseServer();
  await sb.rpc("council_set_session", { p_session: id, p_status: opt(st), p_minutes: minutes });
  revalidatePath(`/staff/council/${id}`);
}
export async function createDecision(fd: FormData) {
  const sess = s(fd, "session"), back = uuidOk(sess) ? `/staff/council/${sess}` : "/staff/council/decisions";
  const year = Number(s(fd, "year"));
  if (!s(fd, "title") || !s(fd, "no") || !Number.isInteger(year)) redirect(`${back}?err=1`);
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("decision_create", {
    p_title: s(fd, "title"), p_no: s(fd, "no"), p_year: year, p_decided_on: optDate(s(fd, "decided_on")), p_session: uuidOk(sess) ? sess : null, p_agenda: null,
    p_body: opt(s(fd, "body")), p_legal_basis: opt(s(fd, "basis")), p_for: optInt(s(fd, "vf")), p_against: optInt(s(fd, "va")), p_abstain: optInt(s(fd, "vb")),
    p_authority: opt(s(fd, "authority")), p_due: optDate(s(fd, "due")), p_responsible: opt(s(fd, "responsible")),
  });
  if (error || !data) redirect(`${back}?err=${error?.code === "23505" ? "dup" : "1"}`);
  redirect(`/staff/council/decisions/${data}`);
}
export async function setDecisionStatus(fd: FormData) {
  const id = s(fd, "id"), kind = s(fd, "kind"); if (!uuidOk(id) || !["legal", "execution"].includes(kind)) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("decision_set_status", { p_id: id, p_kind: kind, p_value: s(fd, "value"), p_note: opt(s(fd, "note")), p_date: optDate(s(fd, "date")) });
  if (error) redirect(`/staff/council/decisions/${id}?err=${error.message.includes("effective_date_required") ? "date" : error.message.includes("validation_required") ? "validation" : "1"}`);
  revalidatePath(`/staff/council/decisions/${id}`);
}
export async function addTask(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id) || !s(fd, "title")) return;
  const to = s(fd, "to");
  const sb = await supabaseServer();
  await sb.rpc("decision_add_task", { p_id: id, p_title: s(fd, "title"), p_assignee: uuidOk(to) ? to : null, p_due: optDate(s(fd, "due")) });
  revalidatePath(`/staff/council/decisions/${id}`);
}
export async function toggleTask(fd: FormData) {
  const t = s(fd, "task"), id = s(fd, "id"); if (!uuidOk(t)) return;
  const sb = await supabaseServer();
  await sb.rpc("decision_toggle_task", { p_task: t, p_done: s(fd, "done") === "1" });
  revalidatePath(`/staff/council/decisions/${id}`);
}

export async function setAttendance(fd: FormData) {
  const id = s(fd, "session"); if (!uuidOk(id)) return;
  const total = Number(s(fd, "total")), present = Number(s(fd, "present"));
  if (!Number.isInteger(total) || !Number.isInteger(present)) redirect(`/staff/council/${id}?err=1`);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("council_set_attendance", { p_session: id, p_total: total, p_present: present, p_summoned: optDate(s(fd, "summoned")), p_second: s(fd, "second") === "1" });
  if (error) redirect(`/staff/council/${id}?err=1`);
  revalidatePath(`/staff/council/${id}`);
}
export async function setReview(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("decision_set_review", { p_id: id, p_category: s(fd, "category"), p_level: s(fd, "level"), p_sent: optDate(s(fd, "sent")), p_received: optDate(s(fd, "received")), p_validated: optDate(s(fd, "validated")), p_note: opt(s(fd, "note")), p_audit_required: fd.get("audit") === "on", p_audit_notice: optDate(s(fd, "audit_notice")), p_tacit_notified: optDate(s(fd, "tacit")) });
  if (error) redirect(`/staff/council/decisions/${id}?err=1`);
  revalidatePath(`/staff/council/decisions/${id}`);
}
