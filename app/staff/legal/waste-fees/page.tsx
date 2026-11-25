import Link from "next/link";
import StaffHeader from "@/components/StaffHeader";
import { requireStaff } from "@/lib/supabase-server";
import { Intro, Notice, Field, Explain, CONTROL, BTN_PRIMARY } from "@/components/simple/kit";
import { FEE_BANDS, FEE_BANDS_META, monthlyBounds, parseWage } from "@/lib/wasteFees";
import { getLaw } from "@/lib/laws";

export const dynamic = "force-dynamic";
export const metadata = { title: "حدود رسم النفايات — BALADI ONE", referrer: "no-referrer" as const };

export default async function WasteFees({ searchParams }: { searchParams: Promise<{ wage?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const wage = parseWage(sp.wage);
  const nf = new Intl.NumberFormat("ar-LB");
  const law = getLaw("WASTE-38");
  return (
    <><StaffHeader back="/staff/legal" backLabel="القواعد القانونية" />
      <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
        <Intro title="حدود رسم جمع النفايات">القانون 38/2026 يترك للبلدية أن تضع جداول الرسم، لكن ضمن حدّ أدنى وأقصى شهري لكل نوع مؤسسة. هنا الحدود كما وردت في الجريدة الرسمية.</Intro>
        <Notice tone="bad">الأرقام منقولة من نسخة الجريدة الرسمية ولم يؤكدها محامٍ بعد. لا تعتمد عليها في قرار رسمي قبل مطابقتها.</Notice>
        <form method="get" className="elev space-y-3 rounded-2xl border bg-background p-4">
          <Field label="الحد الأدنى الرسمي للأجور في القطاع الخاص (شهريًا)" hint="اكتبه كما هو نافذ اليوم. التطبيق لا يفترض رقمًا من عنده." example="أدخل الرقم النافذ"><input name="wage" defaultValue={sp.wage ?? ""} inputMode="numeric" className={CONTROL} /></Field>
          <button className={BTN_PRIMARY}>احسب الحدود</button>
        </form>
        {sp.wage && !wage && <Notice tone="bad">اكتب رقمًا صحيحًا أكبر من صفر.</Notice>}
        <Explain term="كيف تُقرأ النسب؟">كل نسبة هي جزء من الحد الأدنى للأجور في القطاع الخاص، عن الشهر الواحد. بعد إدخال الأجر تظهر الحدود بالعملة نفسها.</Explain>
        <div className="elev overflow-x-auto rounded-2xl border bg-background">
          <table className="w-full text-base"><thead className="bg-muted/50"><tr><th className="p-3 text-start">نوع المؤسسة</th><th className="p-3">الأدنى %</th><th className="p-3">الأقصى %</th>{wage && <><th className="p-3">الأدنى شهريًا</th><th className="p-3">الأقصى شهريًا</th></>}</tr></thead>
            <tbody className="divide-y">{FEE_BANDS.map((b) => { const m = wage ? monthlyBounds(b, wage) : null; return (
              <tr key={b.key}><td className="p-3">{b.label}</td><td className="p-3 text-center">{b.min_pct}</td><td className="p-3 text-center">{b.max_pct}</td>{m && <><td className="p-3 text-center font-semibold">{nf.format(m.min)}</td><td className="p-3 text-center font-semibold">{nf.format(m.max)}</td></>}</tr>); })}</tbody></table>
        </div>
        <p className="text-sm text-muted-foreground">المصدر: {FEE_BANDS_META.source}. {law && <Link href={`/laws/${law.id}`} className="font-semibold text-primary underline">النص الكامل للقانون ←</Link>}</p>
        <p className="text-sm text-muted-foreground">يلزم البلدية خلال 3 أشهر من صدور القانون إصدار قرار بتفاصيل الرسم وطريقة جبايته ووتيرته والحوافز على الفرز (م.28 بند 6-هـ)، ويجوز تعديل القيمة بمرسوم.</p>
      </main></>
  );
}
