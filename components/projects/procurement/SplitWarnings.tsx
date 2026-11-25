import { type SplitGroup } from "@/lib/procurement";
import { money } from "./data";
export default function SplitWarnings({ groups, labels, windowDays }: { groups: SplitGroup[]; labels: Record<string, string>; windowDays: number }) {
  return (
    <section className="elev space-y-2 rounded-2xl border bg-background p-4">
      <h2 className="font-bold text-primary">تنبيهات احتمال التجزئة</h2>
      {groups.length === 0 ? <p className="text-sm text-muted-foreground">لا مجموعات مشتبه بها ضمن نافذة {windowDays} يومًا.</p> : (
        <ul className="space-y-2 text-sm">{groups.map((g, k) => (
          <li key={k} className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
            <p className="font-bold">⚠ {g.message}</p>
            <p className="text-xs">{g.count} مشتريات ({g.reason === "same_supplier" ? "المورّد نفسه" : "موضوع متشابه"}) · المجموع {money(g.total, g.currency)}{g.band_changes ? " · المجموع يقع في فئة أسلوب مختلفة وفق السقوف المحمَّلة" : ""}</p>
            <ul className="list-disc pr-5 text-xs">{g.ids.map((id) => <li key={id}>{labels[id] ?? id}</li>)}</ul>
          </li>))}</ul>)}
      <p className="text-[11px] text-muted-foreground">كشف استرشادي (تشابه الموضوع/المورّد ضمن نافذة زمنية قابلة للضبط)؛ لا يُثبت تجزئة ولا يمنع شيئًا، والحكم للمختص بعد مراجعة الملفات.</p>
    </section>
  );
}
