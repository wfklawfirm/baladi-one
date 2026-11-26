import Link from "next/link";
import { createProcDecision } from "@/app/staff/procurement/actions";
import { ISSUER_LABEL, STATUS_LABEL, type TemplateRow } from "@/lib/decisions/model";

export type LinkedDecision = { decision_id: string; title: string | null; decision_no: string | null; year: number | null };
type Sess = { id: string; session_no: string | null; title: string; held_on: string };

/** Button 'إنشاء مسودة قرار' for a plan item: offers only procurement-domain templates that exist in the decision library; says so when none exists. */
export default function DocDecisionDraft({ item, templates, sessions, linked }: { item: string; templates: TemplateRow[]; sessions: Sess[]; linked: LinkedDecision[] }) {
  return (
    <section className="space-y-3 rounded-2xl border p-4" aria-label="مسودة قرار">
      <h2 className="font-bold text-primary">مسودة قرار لهذا البند</h2>
      {linked.length > 0 && <ul className="space-y-1 text-sm">{linked.map((d) => <li key={d.decision_id}><Link href={`/staff/decisions/${d.decision_id}`} className="font-semibold text-primary underline">{d.title ?? "قرار"}{d.decision_no ? ` (${d.decision_no}/${d.year})` : ""}</Link></li>)}</ul>}
      {templates.length === 0 ? (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">لا يوجد قالب قرار مطابق (مجال «شراء عام») في مكتبة القوالب. لا يُنشأ قرار بقالب غير مطابق؛ أضيفوا القالب من <Link href="/staff/decisions/templates" className="font-semibold underline">إدارة القوالب</Link>.</p>
      ) : (
        <form action={createProcDecision} className="flex flex-wrap items-end gap-2"><input type="hidden" name="item" value={item} />
          <label className="space-y-1 text-sm">القالب<select name="version" required className="min-h-12 rounded-xl border-2 bg-background px-2">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.title_ar} — {STATUS_LABEL[t.status]} ({ISSUER_LABEL[t.issuer]})</option>)}</select></label>
          <label className="space-y-1 text-sm">الجلسة (للقرارات الصادرة عن المجلس)<select name="session" className="min-h-12 rounded-xl border-2 bg-background px-2"><option value="">بلا جلسة</option>
            {sessions.map((x) => <option key={x.id} value={x.id}>{x.session_no ? `${x.session_no} — ` : ""}{x.title} ({x.held_on})</option>)}</select></label>
          <button className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground">إنشاء مسودة قرار</button>
          <p className="basis-full text-sm text-muted-foreground">تُنشأ المسودة بمنشئ القرارات القائم (بحالة مسودة وعلامة مائية) وتُربط بهذا البند؛ لا يُعتمد شيء تلقائيًا ويبقى الاعتماد القانوني بيد المختصين.</p></form>
      )}
    </section>
  );
}
