import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import LegalPanel from "@/components/legal/LegalPanel";
import ContractForm from "@/components/projects/ContractForm";
import ContractControls from "@/components/projects/ContractControls";
import { Chip, Empty, Intro, Notice } from "@/components/simple/kit";
import { CONTRACT_STATUS, daysBetween, expiringContracts, overdueContracts, contractErr } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل العقود — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
const DAYS = 30;

export default async function Contracts({ searchParams }: { searchParams: Promise<{ s?: string; err?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data: dd } = await sb.from("municipal_decision").select("id,decision_no,year,title").in("legal_status", ["adopted", "under_review", "effective"]).order("created_at", { ascending: false }).limit(100);
  const decOpts = ((dd ?? []) as { id: string; decision_no: string; year: number; title: string }[]).map((d) => ({ id: d.id, label: `${d.decision_no}/${d.year} — ${d.title}` }));
  const [cs, pr] = await Promise.all([
    sb.from("contract").select("id,project_id,contractor,subject,value,currency,start_on,end_on,procurement_method,status,notes,is_demo,published_on,award_notice_on,ppa_notice_on,signed_on,decision_id,justification,objection_pending,objection_resolved_on").order("end_on", { ascending: true, nullsFirst: false }).limit(500),
    sb.from("project").select("id,title").order("created_at", { ascending: false }).limit(300),
  ]);
  const t = today();
  const all = cs.data ?? [];
  const soon = new Set(expiringContracts(all, t, DAYS).map((c) => c.id)), over = new Set(overdueContracts(all, t).map((c) => c.id));
  const rows = sp.s && CONTRACT_STATUS[sp.s] ? all.filter((c) => c.status === sp.s) : all;
  const title = (id: string | null) => (pr.data ?? []).find((p) => p.id === id)?.title;
  const chip = (href: string, on: boolean, label: string) => <Link key={href} href={href} className={`min-h-12 rounded-full border-2 px-4 py-2.5 text-base ${on ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{label}</Link>;
  return (
    <><StaffHeader back="/staff/projects" backLabel="المشاريع" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">
      <Intro title="العقود">كل عقود البلدية في مكان واحد، مع تنبيه للعقود التي تقترب من نهايتها أو تجاوزتها. اختاروا حالة لتصفية القائمة، أو سجّلوا عقدًا جديدًا من الأسفل.</Intro>
      {sp.err && <Notice tone="bad">{contractErr(sp.err)}</Notice>}
      {(soon.size > 0 || over.size > 0) && <p role="status" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-base font-semibold">{soon.size > 0 && `${soon.size} عقد ينتهي خلال ${DAYS} يومًا. `}{over.size > 0 && `${over.size} عقد تجاوز تاريخ نهايته دون إغلاق.`}</p>}
      <div className="flex flex-wrap gap-2" aria-label="الحالة">{chip("/staff/projects/contracts", !sp.s, "الكل")}{Object.entries(CONTRACT_STATUS).map(([k, v]) => chip(`/staff/projects/contracts?s=${k}`, sp.s === k, v))}</div>
      {rows.length === 0 ? <Empty>لا توجد عقود في هذه القائمة. يمكنكم تسجيل عقد جديد من الأسفل.</Empty> : (
        <ul className="space-y-3">{rows.map((c) => (
          <li key={c.id} className={`elev space-y-2 rounded-2xl border bg-background p-4 text-base ${soon.has(c.id) || over.has(c.id) ? "border-destructive/60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2"><b className="text-primary">{c.contractor}</b>
              <Chip tone="info">{CONTRACT_STATUS[c.status]}</Chip>
              {soon.has(c.id) && <Chip tone="wait">ينتهي بعد {daysBetween(t, c.end_on!)} يومًا</Chip>}
              {over.has(c.id) && <Chip tone="bad">تجاوز تاريخ النهاية</Chip>}
              {c.is_demo && <span className="rounded bg-muted px-2 text-xs">تجريبي</span>}</div>
            <p>{c.subject}</p>
            <p className="text-xs text-muted-foreground">{Number(c.value).toLocaleString("en-US")} {c.currency === "LBP" ? "ل.ل." : "$"} · {c.start_on ?? "—"} ← {c.end_on ?? "—"}</p>
            {c.project_id && <Link href={`/staff/projects/${c.project_id}`} className="text-xs font-semibold text-primary">المشروع: {title(c.project_id) ?? "عرض"} ←</Link>}
            {c.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{c.notes}</p>}
            <ContractControls c={c} decisions={decOpts} />
          </li>))}</ul>)}
      <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer text-lg font-bold text-primary">+ تسجيل عقد جديد</summary><ContractForm projects={pr.data ?? []} /></details>
      <LegalPanel workflow="procurement" />
    </main></>
  );
}
