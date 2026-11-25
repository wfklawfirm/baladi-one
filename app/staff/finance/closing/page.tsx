import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { btn, field, Panel } from "@/components/finance/Parts";
import { CheckList, CycleFlash, CycleNav, PendingNotice, ReviewBadge, YearPicker } from "@/components/finance/closing/Parts";
import { blockers, canClose, defaultYearEnd, openCommitments, supplementaryOver, warnings } from "@/lib/budgetCycle";
import { loadClosing, loadDecisions, loadYears } from "@/lib/budgetCycleData";
import { money } from "@/lib/finance";
import { CATEGORY } from "@/lib/council";
import { closeYear, recordFinalAccount, reopenYear, resolveCommitment, setSupplementary, startClosing } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "إقفال السنة المالية وقطع الحساب — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

export default async function Closing({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; fy?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const yq = await loadYears(sb);
  const wanted = /^\d{4}$/.test(sp.fy ?? "") ? Number(sp.fy) : undefined;
  const years = yq.error ? [] : yq.years;
  const fy = years.find((y) => y.year === wanted) ?? (wanted ? undefined : years[0]);
  const year = fy?.year ?? wanted ?? new Date().getFullYear();
  const shell = (body: React.ReactNode) => <><StaffHeader back="/staff/finance" backLabel="المالية" /><main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><CycleNav current="closing" year={year} /><h1 className="text-2xl font-bold">إقفال السنة المالية وقطع الحساب — {year}</h1><CycleFlash ok={sp.ok} err={sp.err} />{body}</main></>;

  if (yq.error) return shell(<PendingNotice />);
  if (!fy) return shell(<p className="text-sm text-muted-foreground">لا سنة مالية مسجّلة بعد.</p>);
  const d = await loadClosing(sb, year, fy.id);
  if (d.missing) return shell(<PendingNotice />);
  const decs = await loadDecisions(sb);
  const cl = d.closing, closed = fy.status === "closed";
  const back = <input type="hidden" name="year" value={year} />;
  const decOpts = (cat?: string) => decs.filter((x) => !cat || x.category === cat).map((x) => <option key={x.id} value={x.id}>{x.decision_no}/{x.year} — {x.title} [{CATEGORY[x.category] ?? x.category}]</option>);
  const resolved = new Map(d.resolutions.map((r) => [r.commitment_id, r.resolution]));
  const open = openCommitments(d.commitments, d.exps, new Set(resolved.keys()), d.reversed);
  const cur = (lineId: string) => d.lines.find((l) => l.id === lineId);
  const codeOf = (lineId: string) => cur(lineId)?.code ?? "";
  const ready = canClose(d.checks);
  const over = cl ? supplementaryOver(cl.supplementary_ends_on, today()) : null;

  return shell(<>
    <YearPicker years={years} current={year} base="/staff/finance/closing" />
    {d.cycleStatus && d.cycleStatus !== "executing" && d.cycleStatus !== "closed" && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">دورة الموازنة لم تبلغ مرحلة التنفيذ بعد (الحالة: {d.cycleStatus}). أكمل مراحلها من صفحة الدورة قبل الإقفال.</p>}

    {closed ? (<>
      <Panel title="السنة مقفلة" sub="لا يقبل أي بند أو التزام أو دفعة أو تعديل أي كتابة على هذه السنة (مطبَّق بمُحفِّزات في قاعدة البيانات).">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">تاريخ الإقفال</dt><dd className="font-bold">{cl?.closed_on ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">قطع الحساب</dt><dd className="font-bold">{d.finalDecision ? `${d.finalDecision.decision_no}/${d.finalDecision.year} — ${d.finalDecision.title}` : "—"}{cl?.final_account_prepared_on ? ` (أُعدّ ${cl.final_account_prepared_on})` : ""}</dd></div>
          <div><dt className="text-xs text-muted-foreground">المدة المتممة</dt><dd>{cl?.supplementary_days ?? "—"} يوم · انتهت {cl?.supplementary_ends_on ?? "—"}{!cl?.supplementary_verified && <ReviewBadge />}</dd></div>
          <div><dt className="text-xs text-muted-foreground">مرات إعادة الفتح</dt><dd>{cl?.reopen_count ?? 0}</dd></div>
        </dl>
        {d.totals.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs">{d.totals.map((t) => <span key={t.currency} className="rounded-lg border px-3 py-1.5">{t.currency}: اعتماد {money(t.credit, t.currency)} · ملتزم {money(t.committed, t.currency)} · مدفوع {money(t.paid, t.currency)} · متاح {money(t.available, t.currency)}</span>)}</div>}
      </Panel>
      <Panel fold title="إعادة فتح تصحيحية" sub="مسار استثنائي موثّق: يلزم سبب مفصّل وقرار معتمد من المجلس؛ يُحفظ قطع الحساب السابق في سجل إعادة الفتح ويجب إعادة تسجيله، ويُدوَّن الأمر في سجل التدقيق.">
        <form action={reopenYear} className="grid gap-3">{back}
          <label className="space-y-1 text-sm font-medium">سبب إعادة الفتح (15 حرفًا على الأقل)<textarea name="reason" required minLength={15} maxLength={1000} rows={3} className={`${field} py-2`} /></label>
          <label className="space-y-1 text-sm font-medium">قرار المجلس المجيز للتصحيح<select name="decision" required className={field}>{decOpts()}</select></label>
          <label className="space-y-1 text-sm font-medium">الجهة / المرجع<input name="authority" maxLength={200} className={field} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" required className="size-5" />أقرّ بأن إعادة الفتح تصحيحية وتُسجَّل في التدقيق.</label>
          <button className={btn} disabled={decs.length === 0}>إعادة فتح السنة</button>
        </form>
      </Panel>
    </>) : !cl ? (
      <Panel title="بدء الإقفال" sub="يبدأ مسار الإقفال ويجمّد الالتزامات الجديدة (حسب الإعداد) مع بقاء الدفع على الالتزامات القائمة.">
        <form action={startClosing} className="grid gap-3 sm:grid-cols-2">{back}
          <label className="space-y-1 text-sm font-medium">نهاية السنة المالية <ReviewBadge /><input name="year_end" type="date" defaultValue={defaultYearEnd(year)} className={field} /><span className="text-[11px] text-muted-foreground">الافتراضي 31/12 على افتراض سنة مالية تقويمية؛ عدّله إن اختلف.</span></label>
          <label className="space-y-1 text-sm font-medium">ملاحظة<input name="note" maxLength={500} className={field} /></label>
          <button className={`${btn} sm:col-span-2`}>بدء إقفال {year}</button>
        </form>
      </Panel>
    ) : (<>
      <Panel title="1. المدة المتممة" sub="طولها قيمة تُدخل بلا افتراض. لا يُقفل العام قبل انتهائها.">
        <p className="mb-3 text-sm">نهاية السنة: <b>{cl.year_end}</b> · طول المدة: <b>{cl.supplementary_days ?? "غير محدَّد"}</b>{cl.supplementary_days !== null && " يوم"} · تنتهي: <b>{cl.supplementary_ends_on ?? "غير محدَّد"}</b>{cl.supplementary_ends_on && <> ({over ? "انتهت" : "جارية"})</>}{!cl.supplementary_verified && <ReviewBadge />}</p>
        <form action={setSupplementary} className="grid gap-3 sm:grid-cols-2">{back}
          <label className="space-y-1 text-sm font-medium">عدد الأيام<input name="days" type="number" min={0} max={366} defaultValue={cl.supplementary_days ?? ""} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">أو تاريخ الانتهاء مباشرة<input name="ends_on" type="date" defaultValue={cl.supplementary_ends_on ?? ""} className={field} /></label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="verified" defaultChecked={cl.supplementary_verified} className="size-5" />تحقّق منها مختص قانوني</label>
          <label className="space-y-1 text-sm font-medium">مرجع/ملاحظة<input name="note" maxLength={500} defaultValue={cl.supplementary_note ?? ""} className={field} /></label>
          <button className={`${btn} sm:col-span-2`}>حفظ المدة المتممة</button>
        </form>
      </Panel>

      <Panel title="2. العمليات المفتوحة — الالتزامات غير المصفّاة" sub="لكل التزام متبقٍّ: سدّد المتبقي، أو سجّل ترحيله إلى السنة الجديدة أو إسقاطه. الترحيل الفعلي للاعتماد يتم بتعديل «مُرحَّل» في السنة الجديدة.">
        {open.length === 0 ? <p className="text-sm text-[#2f7d4f]">لا التزامات مفتوحة.</p> : <ul className="divide-y text-sm">{open.map((o) => { const c = d.commitments.find((x) => x.id === o.id)!; const l = cur(o.lineId); return (
          <li key={o.id} className="space-y-2 py-3"><div className="flex flex-wrap gap-x-3"><b>{money(o.remaining, l?.currency ?? "")}</b><span>متبقٍّ من {money(o.amount, l?.currency ?? "")}</span><span className="text-muted-foreground">{codeOf(o.lineId)} · {c.description}</span>{o.resolved && <span className="rounded-full border border-[#2f7d4f]/50 px-2 text-xs">{resolved.get(o.id) === "carry_over" ? "مُرحَّل" : "ساقط"}</span>}</div>
            <form action={resolveCommitment} className="flex flex-wrap items-end gap-2">{back}<input type="hidden" name="commitment" value={o.id} />
              <label className="text-xs font-medium">المعالجة<select name="resolution" className={`${field} block`}><option value="carry_over">ترحيل</option><option value="lapse">إسقاط</option></select></label>
              <label className="text-xs font-medium">القرار (اختياري)<select name="decision" className={`${field} block`}><option value="">—</option>{decOpts()}</select></label>
              <label className="text-xs font-medium">ملاحظة<input name="note" maxLength={300} className={`${field} block`} /></label><button className={btn}>{o.resolved ? "تحديث" : "تسجيل"}</button></form></li>); })}</ul>}
      </Panel>

      <Panel title="3. المطابقة وقائمة التحقق" sub="المدفوعات مقابل الالتزامات مقابل الاعتمادات، والتعديلات المعلّقة، وقطع الحساب. الشروط الحمراء تمنع الإقفال.">
        {d.checkError ? <PendingNotice /> : <><CheckList checks={d.checks} />
          {d.totals.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs">{d.totals.map((t) => <span key={t.currency} className="rounded-lg border px-3 py-1.5">{t.currency}: اعتماد {money(t.credit, t.currency)} · محجوز {money(t.committed, t.currency)} · مدفوع {money(t.paid, t.currency)} · متاح {money(t.available, t.currency)}</span>)}</div>}</>}
      </Panel>

      <Panel title="4. قطع الحساب" sub="قرار المجلس باعتماد قطع الحساب (فئة «حسابات»). التصديق الحكمي للحسابات مسألة تحتاج تحققًا قانونيًا؛ سجّل تاريخ التصديق إن وُجد.">
        {d.finalDecision && <p className="mb-3 rounded-xl border p-3 text-sm">المسجَّل: <b>{d.finalDecision.decision_no}/{d.finalDecision.year}</b> — {d.finalDecision.title} · أُعدّ {cl.final_account_prepared_on}{cl.final_account_validated_on ? ` · صُدّق ${cl.final_account_validated_on}` : " · تصديقه غير مسجَّل"}{cl.final_account_ref ? ` · مرجع ${cl.final_account_ref}` : ""}</p>}
        <form action={recordFinalAccount} className="grid gap-3 sm:grid-cols-2">{back}
          <label className="space-y-1 text-sm font-medium sm:col-span-2">قرار المجلس<select name="decision" required className={field}>{decOpts("accounts")}</select></label>
          <label className="space-y-1 text-sm font-medium">تاريخ إعداد قطع الحساب<input name="prepared_on" type="date" required max={today()} defaultValue={cl.final_account_prepared_on ?? today()} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">المرجع<input name="ref" maxLength={200} defaultValue={cl.final_account_ref ?? ""} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ التصديق (إن وُجد)<input name="validated_on" type="date" max={today()} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">جهة التصديق<input name="authority" maxLength={200} className={field} /></label>
          <button className={`${btn} sm:col-span-2`} disabled={decOpts("accounts").length === 0}>{d.finalDecision ? "تحديث قطع الحساب" : "تسجيل قطع الحساب"}</button>
          {decOpts("accounts").length === 0 && <p className="text-xs text-destructive sm:col-span-2">لا قرار معتمد بفئة «حسابات» في سجل المجلس؛ سجّله أولًا.</p>}
        </form>
      </Panel>

      <Panel title="5. إقفال السنة" sub="إجراء لا رجوع عنه إلا بمسار تصحيحي موثّق. تُعاد مراجعة كل الشروط في قاعدة البيانات لحظة الإقفال.">
        {!ready && <p className="mb-3 text-sm text-destructive">لا يمكن الإقفال الآن: {blockers(d.checks).length} شرط غير مستوفى.</p>}
        {warnings(d.checks).length > 0 && ready && <p className="mb-3 text-sm text-amber-700">يوجد {warnings(d.checks).length} تنبيه لا يمنع الإقفال؛ راجعها قبل المتابعة.</p>}
        <form action={closeYear} className="grid gap-3">{back}
          <label className="space-y-1 text-sm font-medium">ملاحظة الإقفال<input name="note" maxLength={500} className={field} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" required className="size-5" />أؤكد مراجعة قائمة التحقق وإقفال السنة {year}.</label>
          <button className={btn} disabled={!ready}>إقفال السنة المالية</button>
        </form>
      </Panel>
    </>)}

    {d.reopenings.length > 0 && <Panel title="سجل إعادة الفتح التصحيحية"><ul className="divide-y text-sm">{d.reopenings.map((r) => <li key={r.id} className="py-2"><b>{r.created_at.slice(0, 10)}</b> — {r.reason}</li>)}</ul></Panel>}
    <p className="text-xs text-muted-foreground">لا نصوص مواد قانونية هنا؛ المدة المتممة وشروط قطع الحساب وإعادة الفتح بانتظار المراجعة القانونية (BUD-CYCLE-SUPP، BUD-CYCLE-CLOSE).</p>
  </>);
}
