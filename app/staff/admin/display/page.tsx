import { Shell, field, guard, lbl, submit } from "@/components/admin/ui";
import { BrandPreview } from "@/components/brand/BrandPreview";
import { IDLE_CHOICES, DEFAULT_IDLE_SECONDS } from "@/lib/brand-motion";
import { loadList } from "@/lib/admin";
import { saveDisplay } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "شاشة العرض والانتظار — BALADI ONE", referrer: "no-referrer" as const };

export default async function DisplaySettings({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { sb } = await guard();
  const sp = await searchParams;
  const { rows, missing } = await loadList(sb, "display_setting", "screensaver_enabled,idle_seconds");
  const cur = rows[0];
  const enabled = cur ? cur.screensaver_enabled !== false : true;
  const idle = cur?.idle_seconds ?? DEFAULT_IDLE_SECONDS;
  return (
    <Shell title="شاشة العرض والانتظار" sub="شاشة افتتاح قصيرة عند فتح التطبيق، وشاشة انتظار بشعار AIJUR على الشاشات العامة ووضع المؤتمر. لا تعمل في مساحة الموظفين ولا تُغني عن قفل الجلسة." err={sp.err} missing={missing}>
      {sp.ok && <p role="status" className="rounded-xl border border-primary/40 bg-accent p-3 text-sm font-semibold text-primary">تم حفظ الإعدادات.</p>}
      <form action={saveDisplay} className="max-w-xl space-y-4 rounded-2xl border bg-background p-5">
        <label className="flex min-h-12 items-center gap-3 font-semibold"><input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5 accent-[var(--primary)]" />تفعيل شاشة الانتظار</label>
        <label className={lbl}>مدة عدم التفاعل قبل ظهورها
          <select name="idle" defaultValue={String(idle)} className={field}>{IDLE_CHOICES.map((n) => <option key={n} value={n}>{n} ثانية{n === DEFAULT_IDLE_SECONDS ? " (الافتراضي)" : ""}</option>)}</select>
        </label>
        <button className={submit}>حفظ</button>
      </form>
      <section className="space-y-3"><h2 className="font-bold">معاينة الحركة</h2><BrandPreview />
        <p className="text-sm text-muted-foreground">شاشة الانتظار تُغلق بأول لمسة أو ضغطة مفتاح أو تحريك للفأرة.</p></section>
    </Shell>
  );
}
