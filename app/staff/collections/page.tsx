import Link from "next/link";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { Empty, Intro } from "@/components/simple/kit";
import { recordCollection } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "التحصيل — BALADI ONE", referrer: "no-referrer" as const };
const METHOD: Record<string, string> = { cash: "نقدًا", transfer: "حوالة", cheque: "شيك" };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default async function Collections({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { sb } = await requireStaff();
  const sp = await searchParams;
  const { data } = await sb.from("collection_entry").select("id,service_label,receipt_no,amount,currency,method,created_at").order("created_at", { ascending: false }).limit(25);
  const rows = data ?? [];
  return (
    <><StaffHeader back="/staff" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Intro title="تسجيل مبلغ قبضتموه">سجّلوا هنا أي مبلغ دفعه مواطن للبلدية فيُحفظ في السجل. للتكاليف الرسمية وأوامر القبض استعملوا صفحة «الإيرادات».</Intro>
      <Link href="/staff/revenue" className="inline-flex min-h-11 items-center rounded-full border border-primary px-4 text-sm font-semibold text-primary active:bg-accent">للتكاليف الرسمية وأوامر القبض والإيصالات المرقَّمة: صفحة «الإيرادات» ←</Link>
      {sp.ok && <p role="status" className="rounded-xl border border-primary/40 bg-accent p-3 text-base font-semibold">✓ تم تسجيل المبلغ.</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">لم يُسجَّل المبلغ. تأكدوا أنكم كتبتم رقمًا صحيحًا ثم أعيدوا المحاولة.</p>}
      <form action={recordCollection} className="elev grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2">
        <label className="block space-y-1 text-base font-semibold">المبلغ<span className="block text-sm font-normal text-muted-foreground">بالأرقام فقط</span><input name="amount" inputMode="decimal" required className={field} /></label>
        <label className="space-y-1 text-base font-semibold">العملة<select name="currency" className={field}><option value="LBP">ليرة لبنانية</option><option value="USD">دولار أميركي</option></select></label>
        <label className="space-y-1 text-base font-semibold">طريقة الدفع<select name="method" className={field}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="space-y-1 text-base font-semibold">رقم الإيصال (إن وُجد)<input name="receipt" maxLength={60} className={field} /></label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">المعاملة أو الرسم<input name="label" maxLength={200} placeholder="مثال: رسم رخصة بناء" className={field} /></label>
        <button className="min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90 sm:col-span-2">سجّل المبلغ</button>
      </form>
      <h2 className="text-lg font-bold">آخر ما سُجِّل</h2>
      {rows.length === 0 ? <Empty>لم يُسجَّل أي مبلغ بعد. عندما تسجّلون أول مبلغ يظهر هنا.</Empty> : (
        <ul className="divide-y rounded-xl border bg-background">
          {rows.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm"><b className="text-primary">{Number(r.amount).toLocaleString("en-US")} {r.currency === "USD" ? "$" : "ل.ل."}</b><span>{r.service_label ?? "—"}</span><span className="text-muted-foreground">{METHOD[r.method]}{r.receipt_no ? ` · ${r.receipt_no}` : ""}</span><span className="ms-auto text-xs text-muted-foreground">{fmt(r.created_at)}</span></li>)}
        </ul>
      )}
    </main></>
  );
}
