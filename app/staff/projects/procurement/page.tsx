import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import LegalPanel from "@/components/legal/LegalPanel";
import { Intro, Explain } from "@/components/simple/kit";
import { detectSplitPurchases, type Threshold } from "@/lib/procurement";
import RecommenderCard from "@/components/projects/procurement/RecommenderCard";
import SplitWarnings from "@/components/projects/procurement/SplitWarnings";
import PlanSection, { type PlanRow } from "@/components/projects/procurement/PlanSection";
import { ErrNotice, PendingNotice } from "@/components/projects/procurement/Notice";
import { safe } from "@/components/projects/procurement/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "الشراء العام — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export default async function Procurement({ searchParams }: { searchParams: Promise<{ err?: string; value?: string; currency?: string; year?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams, t = today(), year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(t.slice(0, 4));
  const [plan, th, st, cs, bl] = await Promise.all([
    safe<PlanRow>(sb.from("procurement_plan_item").select("*").eq("fiscal_year", year).order("created_at", { ascending: false }).limit(300)),
    safe<Threshold>(sb.from("procurement_threshold").select("id,method,min_value,max_value,currency,effective_from,effective_to,source,review_status").eq("threshold_kind", "method").limit(500)),
    safe<{ split_window_days: number; split_min_similarity: number }>(sb.from("procurement_setting").select("split_window_days,split_min_similarity").limit(1)),
    safe<{ id: string; contractor: string; subject: string; value: number; currency: string; created_at: string; signed_on: string | null; published_on: string | null }>(sb.from("contract").select("id,contractor,subject,value,currency,created_at,signed_on,published_on").order("created_at", { ascending: false }).limit(500)),
    safe<{ id: string; code: string; title_ar: string }>(sb.from("budget_line").select("id,code,title_ar").eq("kind", "expense").limit(500)),
  ]);
  const cfg = st.data[0] ?? { split_window_days: 90, split_min_similarity: 0.5 };
  const items = cs.data.map((c) => ({ id: c.id, subject: c.subject, contractor: c.contractor, value: c.value, currency: c.currency, date: c.published_on ?? c.signed_on ?? c.created_at.slice(0, 10) }));
  const groups = detectSplitPurchases(items, { windowDays: cfg.split_window_days, minSimilarity: Number(cfg.split_min_similarity), thresholds: th.data, today: t });
  const labels = Object.fromEntries(cs.data.map((c) => [c.id, `${c.contractor} — ${c.subject.slice(0, 60)}`]));
  return (
    <><StaffHeader back="/staff/projects" backLabel="المشاريع" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2"><Intro title="الشراء العام">من هنا تخطّطون لمشتريات السنة، وتعرفون الأسلوب المناسب لقيمة الشراء، ويُنبّهكم النظام إلى تجزئة شراء كبير. لكل عقد «ملف شراء» يتتبّع مراحله.</Intro>
        <div className="flex flex-wrap gap-2 text-base font-semibold"><Link href="/staff/projects/procurement/thresholds" className="rounded-xl border px-4 py-2 active:bg-muted">حدود قيمة الشراء</Link><Link href="/staff/projects/contracts" className="rounded-xl border px-4 py-2 active:bg-muted">سجل العقود</Link></div></div>
      <Explain term="تجزئة الشراء">تقسيم شراء واحد كبير إلى عدة مشتريات صغيرة لتفادي أسلوب أشدّ رقابة. النظام يُنبّه إليها ولا يمنعها.</Explain>
      <ErrNotice err={sp.err} />
      {(plan.missing || th.missing) && <PendingNotice what="خطة الشراء ومحرك التوصية" />}
      {!th.missing && th.data.length === 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">لم تُحمَّل أي سقوف بعد: لن يُصدر المحرك توصية ولا يُمنع أي إجراء.</p>}
      <RecommenderCard thresholds={th.data} today={t} value={sp.value} currency={sp.currency} />
      <SplitWarnings groups={groups} labels={labels} windowDays={cfg.split_window_days} />
      <PlanSection rows={plan.data} lines={bl.data} contracts={cs.data} year={year} />
      <p className="text-sm text-muted-foreground">ملف الشراء الكامل لكل عقد (المراحل، اللجان، النشر الرسمي، التعديلات) يُفتح من سجل العقود عبر «ملف الشراء».</p>
      <LegalPanel workflow="procurement" />
    </main></>
  );
}
