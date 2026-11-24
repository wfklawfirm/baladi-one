"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { dateOk, uuidOk } from "@/lib/council";
import { CONTRACT_STATUS, PRIORITY, PROJECT_STATUS, parseAmount } from "@/lib/projects";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (v: string) => (v ? v : null);
const optDate = (v: string) => (dateOk(v) ? v : null);
const cur = (v: string) => (v === "LBP" ? "LBP" : "USD");
const pct = (v: string) => { const n = parseAmount(v); return n !== null && n <= 100 ? n : null; };

export async function createProject(fd: FormData) {
  const budgetRaw = s(fd, "budget"), budget = budgetRaw ? parseAmount(budgetRaw) : null;
  const dec = s(fd, "decision"), pri = s(fd, "priority");
  if (!s(fd, "title") || (budgetRaw && budget === null) || !PRIORITY[pri]) redirect("/staff/projects?err=1");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("project_create", {
    p_title: s(fd, "title"), p_description: opt(s(fd, "description")), p_location: opt(s(fd, "location")), p_priority: pri, p_decision: uuidOk(dec) ? dec : null,
    p_responsible: opt(s(fd, "responsible")), p_start: optDate(s(fd, "start")), p_due: optDate(s(fd, "due")), p_budget: budget, p_currency: cur(s(fd, "currency")),
  });
  if (error || !data) redirect("/staff/projects?err=1");
  redirect(`/staff/projects/${data}`);
}
export async function setProjectStatus(fd: FormData) {
  const id = s(fd, "id"), v = s(fd, "value"); if (!uuidOk(id) || !PROJECT_STATUS[v]) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("project_set_status", { p_id: id, p_status: v, p_note: opt(s(fd, "note")) });
  if (error) redirect(`/staff/projects/${id}?err=1`);
  revalidatePath(`/staff/projects/${id}`);
}
export async function addMilestone(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id) || !s(fd, "title")) return;
  const w = s(fd, "weight") ? parseAmount(s(fd, "weight")) : 1, pl = s(fd, "planned") ? pct(s(fd, "planned")) : null;
  if (w === null || w <= 0 || (s(fd, "planned") && pl === null)) redirect(`/staff/projects/${id}?err=1`);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("milestone_add", { p_project: id, p_title: s(fd, "title"), p_weight: w, p_planned: pl, p_due: optDate(s(fd, "due")) });
  if (error) redirect(`/staff/projects/${id}?err=1`);
  revalidatePath(`/staff/projects/${id}`);
}
export async function setMilestoneProgress(fd: FormData) {
  const id = s(fd, "id"), mid = s(fd, "milestone"); if (!uuidOk(mid)) return;
  const p = pct(s(fd, "pct")); if (p === null) redirect(`/staff/projects/${id}?err=pct`);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("milestone_progress", { p_milestone: mid, p_pct: p, p_note: opt(s(fd, "note")) });
  if (error) redirect(`/staff/projects/${id}?err=1`);
  revalidatePath(`/staff/projects/${id}`);
}
export async function setSpend(fd: FormData) {
  const id = s(fd, "id"); if (!uuidOk(id)) return;
  const v = parseAmount(s(fd, "spent")); if (v === null) redirect(`/staff/projects/${id}?err=1`);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("project_spend", { p_id: id, p_spent_total: v, p_note: opt(s(fd, "note")) });
  if (error) redirect(`/staff/projects/${id}?err=1`);
  revalidatePath(`/staff/projects/${id}`);
}
export async function addContract(fd: FormData) {
  const pid = s(fd, "project"), back = uuidOk(pid) ? `/staff/projects/${pid}` : "/staff/projects/contracts";
  const value = parseAmount(s(fd, "value"));
  if (!s(fd, "contractor") || !s(fd, "subject") || value === null) redirect(`${back}?err=1`);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("contract_add", {
    p_project: uuidOk(pid) ? pid : null, p_contractor: s(fd, "contractor"), p_subject: s(fd, "subject"), p_value: value, p_currency: cur(s(fd, "currency")),
    p_start: optDate(s(fd, "start")), p_end: optDate(s(fd, "end")), p_procurement: opt(s(fd, "procurement")), p_notes: opt(s(fd, "notes")),
  });
  if (error) redirect(`${back}?err=1`);
  revalidatePath(back); revalidatePath("/staff/projects/contracts");
}
export async function setContractStatus(fd: FormData) {
  const id = s(fd, "id"), v = s(fd, "value"), back = s(fd, "back"); if (!uuidOk(id) || !CONTRACT_STATUS[v]) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("contract_set_status", { p_id: id, p_status: v, p_note: opt(s(fd, "note")) });
  const dest = uuidOk(back) ? `/staff/projects/${back}` : "/staff/projects/contracts";
  if (error) redirect(`${dest}?err=1`);
  revalidatePath(dest); revalidatePath("/staff/projects/contracts");
}
