import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import ContractForm from "@/components/projects/ContractForm";
import { CONTRACT_STATUS, daysBetween, expiringContracts, overdueContracts } from "@/lib/projects";
import { setContractStatus } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل العقود — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
const DAYS = 30;

export default async function Contracts({ searchParams }: { searchParams: Promise<{ s?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const [cs, pr] = await Promise.all([
    sb.from("contract").select("id,project_id,contractor,subject,value,currency,start_on,end_on,procurement_method,status,notes,is_demo").order("end_on", { ascending: true, nullsFirst: false }).limit(500),
    sb.from("project").select("id,title").order("created_at", { ascending: false }).limit(300),
  ]);
  const t = today();
  const all = cs.data ?? [];
  const soon = new Set(expiringContracts(all, t, DAYS).map((c) => c.id)), over = new Set(overdueContracts(all, t).map((c) => c.id));
  const rows = sp.s && CONTRACT_STATUS[sp.s] ? all.filter((c) => c.status === sp.s) : all;
  const title = (id: string | null) => (pr.data ?? []).find((p) => p.id === id)?.title;
  const chip = (href: string, on: boolean, label: string) => <Link key={href} href={href} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{label}</Link>;
  return (
    <><StaffHeader back="/staff/projects" backLabel="المشاريع" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">سجل العقود</h1>
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تحقق من الحقول المطلوبة.</p>}
      {(soon.size > 0 || over.size > 0) && <p role="status" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm font-semibold">{soon.size > 0 && `${soon.size} عقد ينتهي خلال ${DAYS} يومًا. `}{over.size > 0 && `${over.size} عقد تجاوز تاريخ نهايته دون إغلاق.`}</p>}
      <div className="flex flex-wrap gap-2" aria-label="الحالة">{chip("/staff/projects/contracts", !sp.s, "الكل")}{Object.entries(CONTRACT_STATUS).map(([k, v]) => chip(`/staff/projects/contracts?s=${k}`, sp.s === k, v))}</div>
      {rows.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا عقود مسجّلة.</p> : (
        <ul className="space-y-3">{rows.map((c) => (
          <li key={c.id} className={`elev space-y-2 rounded-2xl border bg-background p-4 text-sm ${soon.has(c.id) || over.has(c.id) ? "border-destructive/60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2"><b className="text-primary">{c.contractor}</b>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary">{CONTRACT_STATUS[c.status]}</span>
              {soon.has(c.id) && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-bold text-destructive">ينتهي بعد {daysBetween(t, c.end_on!)} يومًا</span>}
              {over.has(c.id) && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-bold text-destructive">تجاوز تاريخ النهاية</span>}
              {c.is_demo && <span className="rounded bg-muted px-2 text-xs">تجريبي</span>}</div>
            <p>{c.subject}</p>
            <p className="text-xs text-muted-foreground">{Number(c.value).toLocaleString("en-US")} {c.currency === "LBP" ? "ل.ل." : "$"} · {c.start_on ?? "—"} ← {c.end_on ?? "—"}{c.procurement_method ? ` · أسلوب التلزيم: ${c.procurement_method}` : ""}</p>
            {c.project_id && <Link href={`/staff/projects/${c.project_id}`} className="text-xs font-semibold text-primary">المشروع: {title(c.project_id) ?? "عرض"} ←</Link>}
            {c.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{c.notes}</p>}
            <form action={setContractStatus} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={c.id} />
              <select name="value" defaultValue={c.status} aria-label="الحالة" className="min-h-10 rounded-xl border-2 bg-background px-2">{Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="note" maxLength={500} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className="min-h-10 min-w-0 flex-1 rounded-xl border-2 bg-background px-3" />
              <button className="min-h-10 rounded-xl border px-4 text-sm font-semibold active:bg-muted">تحديث الحالة</button></form>
          </li>))}</ul>)}
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold text-primary">تسجيل عقد</summary><ContractForm projects={pr.data ?? []} /></details>
    </main></>
  );
}
