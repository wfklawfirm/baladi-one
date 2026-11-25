import Link from "next/link";
import { requireStaff } from "@/lib/supabase-server";
import { brainConfigured } from "@/lib/brain/rag";
import StaffHeader from "@/components/StaffHeader";
import LegalPanel from "@/components/legal/LegalPanel";
import DecisionGen from "@/components/brain/DecisionGen";
import { bestVersions, loadTemplates } from "@/lib/decisions/load";
import { CLASSES, ISSUER_LABEL, KIND_LABEL, STATUS_LABEL, classesOf, type TplStatus } from "@/lib/decisions/model";
import { createFromTemplate } from "./actions";
import { errText } from "@/lib/decisions/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "منشئ القرارات البلدية — BALADI ONE", referrer: "no-referrer" as const };
/** The eight most common municipal decisions; resolved to the imported template versions by template_id (nothing is shown for a template that is not in the library). */
const COMMON: [string, string][] = [["FIN02", "نقل اعتماد"], ["FIN08", "قبول هبة"], ["FIN13", "عقد نفقة"], ["GOV01", "تأليف لجنة"], ["DEV01", "مشروع أشغال"], ["ASSET02", "تأجير ملك بلدي"], ["REV05", "تقسيط رسوم"], ["HR05", "منح إجازة"]];
type SP = { c?: string; q?: string; s?: string; err?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const { sb, memberships } = await requireStaff();
  const sp = await searchParams;
  const canCreate = memberships.some((m) => m.role === "admin" || m.role === "mayor");
  const { rows } = await loadTemplates(sb);
  const all = bestVersions(rows);
  const needle = (sp.q ?? "").trim().toLowerCase();
  const list = all.filter((t) => (!sp.c || classesOf(t).includes(sp.c)) && (!sp.s || t.status === sp.s)
    && (!needle || t.title_ar.toLowerCase().includes(needle) || t.template_id.toLowerCase().includes(needle) || (t.category_ar ?? "").toLowerCase().includes(needle)));
  const { data: sess } = await sb.from("council_session").select("id,session_no,title,held_on").order("held_on", { ascending: false }).limit(30);
  const href = (o: Partial<SP>) => { const p = new URLSearchParams(); const m = { ...sp, ...o }; for (const k of ["c", "q", "s"] as const) if (m[k]) p.set(k, m[k] as string); const s = p.toString(); return `/staff/decisions${s ? `?${s}` : ""}`; };
  const chip = (h: string, on: boolean, label: string, n?: number) => <Link key={h + label} href={h} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{label}{n !== undefined && <span className="ms-1 opacity-70">({n})</span>}</Link>;
  const approved = all.filter((t) => t.status === "approved").length;
  return (
    <>
      <StaffHeader />
      <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">منشئ القرارات البلدية</h1>
          <div className="flex gap-2 text-sm"><Link href="/staff/council/decisions" className="min-h-10 rounded-xl border px-3 py-2 hover:bg-muted">سجل القرارات</Link>{canCreate && <Link href="/staff/decisions/templates" className="min-h-10 rounded-xl border px-3 py-2 hover:bg-muted">إدارة القوالب</Link>}</div>
        </div>
        <p className="text-sm text-muted-foreground">اختر القالب فيُنشأ مسودة قرار تُملأ حقولها من سجلات البلدية والجلسة. المراجع القانونية لا تظهر في الصيغة الرسمية إلا إذا تحقق منها محامٍ في سجل القواعد، والقوالب لا تُعتمد إلا بمراجعة قانونية بمراجعَين مختلفَين.</p>
        {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{errText({ message: sp.err })}</p>}
        {all.length > 0 && (
          <section aria-label="الأكثر استخدامًا" className="space-y-3"><h2 className="text-lg font-bold">ماذا تريدون أن تُصدروا؟</h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {COMMON.map(([tid, label]) => { const t = all.find((x) => x.template_id === tid); if (!t) return null;
                return (
                  <li key={tid} className="flex flex-col gap-2 rounded-2xl border bg-background p-3">
                    <b className="text-base leading-6">{label}</b><span className="text-xs text-muted-foreground">{t.title_ar}</span>
                    {canCreate ? (
                      <form action={createFromTemplate} className="mt-auto space-y-2"><input type="hidden" name="version" value={t.id} />
                        {t.issuer === "municipal_council" && <select name="session" aria-label="الجلسة" className="min-h-11 w-full rounded-xl border px-2 text-sm"><option value="">بلا جلسة</option>
                          {(sess ?? []).map((x) => <option key={x.id} value={x.id}>{x.session_no ? `${x.session_no} — ` : ""}{x.title} ({x.held_on})</option>)}</select>}
                        <button className="min-h-12 w-full rounded-xl bg-primary px-3 text-base font-bold text-primary-foreground">ابدأ</button></form>
                    ) : <p className="mt-auto text-xs text-muted-foreground">للرئيس أو المسؤول.</p>}
                  </li>); })}
            </ul></section>
        )}
        {all.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
            المكتبة فارغة بعد. <>استورد القوالب من <Link className="font-semibold text-primary underline" href="/staff/decisions/templates">إدارة القوالب</Link>؛ تدخل كلها «بانتظار المراجعة القانونية».</>
          </div>
        ) : (
          <details open={!!(sp.c || sp.q || sp.s)} className="rounded-2xl border p-4"><summary className="min-h-11 cursor-pointer text-base font-bold leading-[2.75rem]">كل القوالب ({all.length})</summary>
            <div className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">{all.length} قالبًا — المعتمد قانونيًا: {approved}. القوالب غير المعتمدة مسودات تأسيسية تحتاج مراجعة محامٍ قبل الاعتماد.</p>
            <form className="flex flex-wrap gap-2">
              <input name="q" defaultValue={sp.q} placeholder="بحث بالعنوان أو الرمز" aria-label="بحث" className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm" />
              {sp.c && <input type="hidden" name="c" value={sp.c} />}{sp.s && <input type="hidden" name="s" value={sp.s} />}
              <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">بحث</button>
            </form>
            <div className="flex flex-wrap gap-2" aria-label="التصنيف">
              {chip(href({ c: undefined }), !sp.c, "الكل", all.length)}
              {CLASSES.map((c) => chip(href({ c: c.id }), sp.c === c.id, c.label, all.filter((t) => classesOf(t).includes(c.id)).length))}
            </div>
            <div className="flex flex-wrap gap-2" aria-label="الحالة"><span className="self-center text-xs text-muted-foreground">الحالة:</span>
              {chip(href({ s: undefined }), !sp.s, "الكل")}{(["approved", "pending_legal_review", "draft"] as TplStatus[]).map((s) => chip(href({ s }), sp.s === s, STATUS_LABEL[s]))}
            </div>
            <p className="text-sm text-muted-foreground">{list.length} نتيجة</p>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 rounded-2xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-2"><b className="leading-6">{t.title_ar}</b><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold" dir="ltr">{t.template_id}</span></div>
                  <p className="text-xs text-muted-foreground">{t.category_ar} · {ISSUER_LABEL[t.issuer]} · {KIND_LABEL[t.document_kind]}</p>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className={`rounded-full px-2 py-0.5 ${t.status === "approved" ? "bg-accent text-primary" : "bg-muted"}`}>{STATUS_LABEL[t.status]}</span>
                    {t.risk === "high" && <span className="rounded-full border border-destructive/40 px-2 py-0.5">مخاطر عالية</span>}
                    <span className="rounded-full bg-muted px-2 py-0.5">إصدار {t.version}</span>
                  </div>
                  {canCreate ? (
                    <form action={createFromTemplate} className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <input type="hidden" name="version" value={t.id} />
                      {t.issuer !== "executive_authority" && (
                        <select name="session" aria-label="الجلسة" className="min-h-10 min-w-0 flex-1 rounded-xl border px-2 text-xs"><option value="">بلا جلسة</option>
                          {(sess ?? []).map((s) => <option key={s.id} value={s.id}>{s.session_no ? `${s.session_no} — ` : ""}{s.title} ({s.held_on})</option>)}</select>)}
                      <button className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">إنشاء قرار</button>
                    </form>
                  ) : <p className="mt-auto text-xs text-muted-foreground">الإنشاء لرئيس البلدية أو المسؤول.</p>}
                </li>
              ))}
            </ul>
            </div>
          </details>
        )}
        <details className="rounded-2xl border p-4"><summary className="cursor-pointer text-sm font-semibold">المولّد الحر القديم (مسودة نصية بالذكاء الاصطناعي)</summary>
          <div className="pt-3">{brainConfigured() ? <DecisionGen /> : <p className="text-sm text-muted-foreground">قريبًا — الأداة قيد التفعيل.</p>}</div></details>
      <LegalPanel workflow="waste" />
    </main>
    </>
  );
}
