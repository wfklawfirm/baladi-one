import { expiringContracts, isDelayed, physicalProgress } from "./projects";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

/** Dashboard summary (RLS-scoped through the caller's client). activeCount = status active or delayed; avgProgress = mean physical progress of open projects that have milestones (null if none). */
export async function projectStats(sb: any, expiryDays = 30) {
  const t = today();
  const [pr, ms, ct] = await Promise.all([
    sb.from("project").select("id,title,status,due_on").limit(2000),
    sb.from("project_milestone").select("project_id,weight,progress_pct").limit(20000),
    sb.from("contract").select("id,contractor,subject,status,end_on,project_id").in("status", ["signed", "active"]).limit(2000),
  ]);
  const projects = (pr.data ?? []) as { id: string; title: string; status: string; due_on: string | null }[];
  const mrows = (ms.data ?? []) as { project_id: string; weight: number; progress_pct: number }[];
  const open = projects.filter((p) => p.status !== "completed" && p.status !== "stopped" && p.status !== "proposed");
  const delayedList = projects.filter((p) => p.status === "delayed" || isDelayed(p, t));
  const progs = open.map((p) => physicalProgress(mrows.filter((m) => m.project_id === p.id))).filter((v): v is number => v !== null);
  return {
    activeCount: projects.filter((p) => p.status === "active" || p.status === "delayed").length,
    delayedList,
    avgProgress: progs.length ? Math.round(progs.reduce((a, b) => a + b, 0) / progs.length) : (null as number | null),
    expiringContracts: expiringContracts((ct.data ?? []) as { id: string; contractor: string; subject: string; status: string; end_on: string | null; project_id: string | null }[], t, expiryDays),
  };
}
