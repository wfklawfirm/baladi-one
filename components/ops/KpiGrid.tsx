import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Spark } from "@/components/ops/Charts";
import type { buildCards } from "@/lib/opsData";

export default function KpiGrid({ cards }: { cards: ReturnType<typeof buildCards> }) {
  return (
    <section aria-label="المؤشرات الرئيسية" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map((c) => {
        const D = c.delta;
        const Ar = D?.dir === "up" ? ArrowUpRight : D?.dir === "down" ? ArrowDownRight : Minus;
        const inner = (
          <>
            <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{c.def.ar}</span>{c.spark && <Spark values={c.spark} />}</div>
            {c.value !== null ? <b className="mt-2 block text-3xl text-primary">{c.value}</b> : <b className="mt-2 block text-base text-muted-foreground">بيانات غير متوفرة</b>}
            {c.value !== null && c.lines?.map((l) => <span key={l} className="block text-xs text-muted-foreground">{l}</span>)}
            {c.value === null && <span className="mt-1 block text-xs text-muted-foreground">{c.reason}</span>}
            {D && <span className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${D.good === null ? "text-muted-foreground" : D.good ? "text-[#2f7d4f]" : "text-destructive"}`}><Ar className="size-4" aria-hidden />{D.text} عن الفترة السابقة</span>}
            {c.def.target !== null && <span className="mt-1 block text-xs text-muted-foreground">المستهدف: {c.def.target}{c.def.unit}</span>}
          </>
        );
        const cls = "elev block rounded-2xl border bg-background p-4";
        return c.def.href === "#" ? <div key={c.def.id} className={`${cls} opacity-80`}>{inner}</div> : <Link key={c.def.id} href={c.def.href} className={`${cls} elev-hover active:bg-muted`}>{inner}</Link>;
      })}
    </section>
  );
}
