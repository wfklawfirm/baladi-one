import { Shell, field, guard, lbl, submit } from "@/components/admin/ui";
import { BrandPreview } from "@/components/brand/BrandPreview";
import { IDLE_CHOICES, DEFAULT_IDLE_SECONDS } from "@/lib/brand-motion";
import { Explain } from "@/components/simple/kit";
import { loadList } from "@/lib/admin";
import { saveDisplay } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "شاشة العرض والانتظار — BALADI ONE", referrer: "no-referrer" as const };

export default async function DisplaySettings({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { sb } = await guard();
  const sp = await searchParams;
  const { rows, missing } = await loadList(sb, "display_setting", "screensaver_enabled,idle_seconds,screensaver_qr");
  const cur = rows[0];
  const enabled = cur ? cur.screensaver_enabled !== false : true;
  const idle = cur?.idle_seconds ?? DEFAULT_IDLE_SECONDS;
  const qr = cur ? cur.screensaver_qr !== false : true;
  return (
    <Shell title="شاشة العرض والانتظار" sub="عندما تُترك الشاشة العامة دون لمس، تظهر شاشة انتظار بشعار AIJUR. هنا تقرّرون: هل تظهر؟ بعد كم ثانية؟ وهل يظهر معها رمز QR؟" err={sp.err} missing={missing}>
      {sp.ok && <p role="status" className="rounded-xl border border-primary/40 bg-accent p-3 text-base font-semibold text-primary">✓ تم حفظ الإعدادات.</p>}
      <form action={saveDisplay} className="max-w-xl space-y-4 rounded-2xl border bg-background p-5">
        <label className="flex min-h-12 items-center gap-3 font-semibold"><input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5 accent-[var(--primary)]" />أُظهر شاشة الانتظار</label>
        <label className="flex min-h-12 items-center gap-3 font-semibold"><input type="checkbox" name="qr" defaultChecked={qr} className="size-5 accent-[var(--primary)]" />أُظهر رمز QR (www.aijur.ai) معها</label>
        <label className={lbl}>كم ثانية دون لمس قبل أن تظهر؟
          <select name="idle" defaultValue={String(idle)} className={field}>{IDLE_CHOICES.map((n) => <option key={n} value={n}>{n} ثانية{n === DEFAULT_IDLE_SECONDS ? " (الافتراضي)" : ""}</option>)}</select>
        </label>
        <button className={submit}>احفظ الإعدادات</button>
        <Explain term="هل تعمل داخل مساحة الموظفين؟">لا. هي للشاشات العامة ووضع المؤتمر فقط، ولا تُغني عن قفل حسابكم عند مغادرة المكتب.</Explain>
      </form>
      <section className="space-y-3"><h2 className="text-lg font-bold">هكذا ستبدو</h2><BrandPreview qr={qr} />
        <p className="text-base text-muted-foreground">تُغلق شاشة الانتظار بأول لمسة أو ضغطة مفتاح أو تحريك للفأرة.</p></section>
    </Shell>
  );
}
