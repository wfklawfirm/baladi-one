import Link from "next/link";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Intro } from "@/components/simple/kit";
import { loadRevenue } from "@/lib/revenueData";
import { arrearsByCurrency, NA, NOT_LOADED, orderState } from "@/lib/revenue";
import { money, r2 } from "@/lib/finance";
import { dayKey } from "@/lib/ops";
import { Flash, LegalNote, Panel, Pending, RevenueNav } from "@/components/revenue/Parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإيرادات والتكليف — BALADI ONE", referrer: "no-referrer" as const };

export default async function Revenue({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb } = await requireStaff();
  const sp = await searchParams;
  const d = await loadRevenue(sb);
  const today = dayKey(new Date());
  return (
    <><StaffHeader back="/staff/collections" backLabel="التحصيل" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Intro title="الإيرادات">من هنا تتابعون ما تجبيه البلدية: من يدين لها، وما صدر من أوامر دفع، وما تمّ تحصيله. ابدأوا من الخطوات الأربع أدناه.</Intro>
      <RevenueNav current="home" />
      <Flash ok={sp.ok} err={sp.err} />
      <LegalNote />
      {d.error ? <Pending missing={d.missing} /> : (() => {
        const rows = d.orders.map((o) => ({ o, ...orderState(o, d.receipts, today) }));
        const arr = arrearsByCurrency(d.orders, d.receipts, today);
        const verified = d.rules.filter((r) => r.review_status === "verified").length;
        const tot = (cur: string, f: (x: (typeof rows)[number]) => number) => r2(rows.filter((x) => x.o.currency === cur && x.o.status !== "cancelled").reduce((s, x) => s + f(x), 0));
        const cards: [string, string][] = [
          ["عدد المكلّفين", String(d.taxpayers.length)], ["تكاليف بانتظار أمر القبض", String(d.assessments.filter((a) => a.status === "assessed").length)],
          ["أوامر قبض مفتوحة", String(rows.filter((x) => x.open).length)], ["اعتراضات قيد النظر", String(d.objections.filter((o) => o.status === "filed").length)],
          ["قواعد الرسوم (الكل / المؤكَّدة)", d.rules.length ? `${d.rules.length} / ${verified}` : NOT_LOADED],
        ];
        return <>
          {d.partial && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">بعض الجداول غير متاحة: الأرقام جزئية.</p>}
          <div className="fill-odd grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([t, v]) => <div key={t} className="elev rounded-2xl border bg-background p-4"><div className="text-xs text-muted-foreground">{t}</div><div className="mt-1 text-2xl font-bold text-primary">{v}</div></div>)}</div>
          <Panel title="الأوامر والتحصيل (بحسب العملة)" sub="العملات لا تُجمع معًا. صافي المحصَّل يستثني الإيصالات المعكوسة.">
            {rows.length === 0 ? <p className="text-base text-muted-foreground">لا توجد أوامر قبض بعد. ابدأوا بتسجيل مكلّف ثم تكليف.</p> :
              <div className="grid gap-3 sm:grid-cols-2">{(["LBP", "USD"] as const).map((c) => rows.some((x) => x.o.currency === c) && <div key={c} className="rounded-xl border p-3 text-sm"><b>{c === "USD" ? "دولار" : "ليرة"}</b><div>الأوامر: {money(tot(c, (x) => x.amount), c)}</div><div>المحصَّل: {money(tot(c, (x) => x.collected), c)}</div><div>المتبقي: {money(tot(c, (x) => x.remaining), c)}</div></div>)}</div>}
          </Panel>
          <Panel title="المتأخرات" sub="أوامر مفتوحة تجاوزت تاريخ الاستحقاق. الغرامات والفوائد: لا تُحتسب لأن لا قاعدة متحقَّق منها.">
            {arr.length === 0 ? <p className="text-base text-green-800">✓ لا متأخرات.</p> :
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>العملة</th><th>عدد</th><th>الإجمالي</th><th>1–30 يومًا</th><th>31–90</th><th>أكثر من 90</th><th>الغرامات</th></tr></thead>
                <tbody className="divide-y">{arr.map((a) => <tr key={a.currency} className="[&>td]:px-2 [&>td]:py-2.5"><td>{a.currency}</td><td>{a.count}</td><td className="font-bold text-destructive">{money(a.total, a.currency)}</td><td>{money(a.d1_30, a.currency)}</td><td>{money(a.d31_90, a.currency)}</td><td>{money(a.d90p, a.currency)}</td><td>{NA}</td></tr>)}</tbody></table></div>}
          </Panel>
          <p className="text-sm text-muted-foreground">المسار: <Link href="/staff/revenue/taxpayers" className="underline">مكلّف</Link> ← <Link href="/staff/revenue/assessments" className="underline">تكليف</Link> ← <Link href="/staff/revenue/orders" className="underline">أمر قبض وتبليغ واعتراض</Link> ← <Link href="/staff/revenue/collect" className="underline">تحصيل وإيصال</Link> ← <Link href="/staff/revenue/cash" className="underline">مطابقة الصندوق</Link></p>
        </>;
      })()}
    </main></>
  );
}
