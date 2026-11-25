import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { btn, field, Panel } from "@/components/finance/Parts";
import { CycleFlash, CycleNav, PendingNotice, ReviewBadge, Stepper, YearPicker } from "@/components/finance/closing/Parts";
import { AMEND_LABEL, AMEND_TYPES, availabilityTotals, CYCLE_LABEL, CYCLE_STAGES, DEFAULT_RULES, executionMissing, nextStage, STAGE_EVIDENCE, stageDates, type CycleStage } from "@/lib/budgetCycle";
import { loadDecisions, loadLifecycle, loadYears } from "@/lib/budgetCycleData";
import { money } from "@/lib/finance";
import { CATEGORY } from "@/lib/council";
import { advanceCycle, amendTyped, openCycle, releaseSuspension, saveSettings, transferCredit, validateTyped } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "دورة الموازنة والاعتمادات — BALADI ONE", referrer: "no-referrer" as const };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
const NEXT_NEEDS: Record<string, { decision?: boolean; authority?: boolean; session?: boolean }> = { adopted: { decision: true }, validated: { authority: true }, presented: { session: true } };

export default async function Lifecycle({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; fy?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const yq = await loadYears(sb);
  const wanted = /^\d{4}$/.test(sp.fy ?? "") ? Number(sp.fy) : undefined;
  const years = yq.error ? [] : yq.years;
  const fy = years.find((y) => y.year === wanted) ?? (wanted ? undefined : years[0]);
  const year = fy?.year ?? wanted ?? new Date().getFullYear();
  const header = <StaffHeader back="/staff/finance" backLabel="المالية" />;
  const shell = (body: React.ReactNode) => <>{header}<main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><CycleNav current="lifecycle" year={year} /><h1 className="text-2xl font-bold">دورة الموازنة والاعتمادات — {year}</h1><CycleFlash ok={sp.ok} err={sp.err} />{body}</main></>;

  if (yq.error) return shell(<PendingNotice />);
  const openForm = (label: string) => (
    <form action={openCycle} className="flex flex-wrap items-end gap-2"><label className="text-xs font-medium">السنة المالية<input name="year" type="number" min={1990} max={2100} defaultValue={year} required className={`${field} block w-32`} /></label><button className={btn}>{label}</button></form>
  );
  if (!fy) return shell(<Panel title="لا سنة مالية بعد" sub="افتح مسار دورة الموازنة لسنة جديدة؛ تُنشأ السنة المالية معه."><div className="mt-2">{openForm("فتح مسار الدورة")}</div></Panel>);

  const d = await loadLifecycle(sb, fy.id);
  if (d.missing) return shell(<PendingNotice />);
  const decs = await loadDecisions(sb);
  const c = d.cycle, closed = fy.status === "closed";
  const back = <input type="hidden" name="year" value={year} />;
  const lineOpt = (l: (typeof d.lines)[number]) => <option key={l.id} value={l.id}>{l.code} · {l.title_ar} ({l.currency})</option>;
  const expLines = d.lines.filter((l) => l.kind === "expense");
  const decOpts = decs.map((x) => <option key={x.id} value={x.id}>{x.decision_no}/{x.year} — {x.title} [{CATEGORY[x.category] ?? x.category}]</option>);
  const missing = executionMissing(c, d.adoption ?? undefined);
  const next = c ? nextStage(c.status) : null;
  const dates = c ? Object.fromEntries(stageDates(c).map((x) => [x.stage, x.on])) as Record<string, string | null> : {};
  const stages = CYCLE_STAGES.map((k) => ({ key: k, label: CYCLE_LABEL[k] }));
  const pendingTyped = d.amendments.filter((a) => !a.applied);
  const activeSusp = d.amendments.filter((a) => a.amendment_type === "suspended" && a.applied && !a.suspension_released_on);
  const lineOf = (id: string) => d.lines.find((l) => l.id === id);
  const totals = availabilityTotals(d.av);

  return shell(<>
    <YearPicker years={years} current={year} base="/staff/finance/lifecycle" />
    {closed && <p role="status" className="rounded-xl border border-destructive/40 p-3 text-sm font-medium">هذه السنة مقفلة: لا يُقبل أي تعديل على بنودها أو التزاماتها أو تعديلاتها. إعادة الفتح عبر مسار التصحيح الموثّق في صفحة الإقفال فقط.</p>}
    {d.partial && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تعذّر تحميل جزء من البيانات؛ قد تكون الأرقام ناقصة.</p>}

    <Panel title="مراحل الدورة" sub="تسلسل إلزامي بلا تخطٍّ؛ كل انتقال يُسجَّل في سجل التدقيق. الموازنة وقرارات نقل الاعتمادات لا يسري عليها التصديق الحكمي.">
      {!c ? (
        <div className="space-y-3 text-sm"><p>لم يُفتح مسار دورة الموازنة لسنة {year}. {d.setting?.require_cycle_for_execution ? "التنفيذ الآن ممنوع على هذه السنة إلى حين فتح المسار وتسجيل أدلة الاعتماد والتصديق." : "لا أدلة اعتماد أو تصديق مسجَّلة؛ التنفيذ ما زال مسموحًا بحكم الإعداد الحالي، ويُنصح بفتح المسار."}</p>{openForm("فتح مسار الدورة")}</div>
      ) : (<div className="space-y-4">
        <Stepper stages={stages} current={c.status} dates={dates} />
        <div className={`rounded-xl border p-3 text-sm ${missing.length ? "border-destructive/40" : "border-[#2f7d4f]/50"}`}>
          <b>{missing.length ? "التنفيذ غير مسموح بعد — الناقص:" : "أدلة الاعتماد والتصديق مكتملة."}</b>
          {missing.length > 0 && <ul className="mt-1 list-disc ps-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>}
          {d.adoption && <p className="mt-1 text-xs text-muted-foreground">قرار الاعتماد: {d.adoption.decision_no}/{d.adoption.year} — {d.adoption.title}</p>}
          {c.validation_authority && <p className="text-xs text-muted-foreground">جهة التصديق: {c.validation_authority}{c.validated_on ? ` — ${c.validated_on}` : ""}</p>}
        </div>
        {next && !closed && (
          <form action={advanceCycle} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">{back}<input type="hidden" name="to" value={next} />
            <p className="text-sm font-bold sm:col-span-2">المرحلة التالية: {CYCLE_LABEL[next]}<span className="block text-xs font-normal text-muted-foreground">المطلوب: {STAGE_EVIDENCE[next as Exclude<CycleStage, "preparation" | "closed">]}</span></p>
            <label className="space-y-1 text-sm font-medium">التاريخ<input name="date" type="date" required defaultValue={today()} max={today()} className={field} /></label>
            {NEXT_NEEDS[next]?.decision && <label className="space-y-1 text-sm font-medium">قرار المجلس (فئة موازنة)<select name="decision" required className={field}>{decOpts}</select></label>}
            {NEXT_NEEDS[next]?.authority && <label className="space-y-1 text-sm font-medium">جهة التصديق<input name="authority" required maxLength={200} className={field} placeholder="مثال: المحافظ" /></label>}
            <label className="space-y-1 text-sm font-medium sm:col-span-2">ملاحظة / مرجع المستند<input name="note" maxLength={500} className={field} /></label>
            <button className={`${btn} sm:col-span-2`} disabled={next === "adopted" && decs.length === 0}>تسجيل المرحلة</button>
            {next === "adopted" && decs.length === 0 && <p className="text-xs text-destructive sm:col-span-2">لا يوجد قرار معتمد في سجل المجلس؛ سجّل القرار بفئة «موازنة» أولًا.</p>}
          </form>)}
        {d.events.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold text-primary">سجل المراحل ({d.events.length})</summary><ul className="mt-2 divide-y">{d.events.map((e) => <li key={e.id} className="flex flex-wrap gap-x-3 py-1.5"><b>{CYCLE_LABEL[e.to_status as CycleStage] ?? e.to_status}</b><span className="text-muted-foreground">{e.event_date ?? ""}</span>{e.note && <span>{e.note}</span>}</li>)}</ul></details>}
      </div>)}
    </Panel>

    <Panel title="التوفر (المتاح)" sub="المتاح = الاعتماد الفعلي − المعلَّق − (الالتزامات + المدفوعات غير المرتبطة بالتزام). الدفعة المرتبطة بالتزام لا تُحسب مرتين. التعديلات المعلّقة لا تدخل في المتاح وتظهر منفصلة.">
      {d.av.length === 0 ? <p className="text-sm text-muted-foreground">لا بنود موازنة لهذه السنة.</p> : (<>
        <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>البند</th><th>الأصلي</th><th>الاعتماد الفعلي</th><th>تعديلات معلّقة</th><th>معلَّق (تجميد)</th><th>الالتزامات</th><th>مدفوع بلا التزام / أوامر مباشرة</th><th>المتاح</th></tr></thead>
          <tbody className="divide-y">{d.av.map((a) => { const l = d.lines.find((q) => q.id === a.lineId)!; const m = (v: number) => money(v, a.currency); return (
            <tr key={a.lineId} className="[&>td]:px-2 [&>td]:py-2.5"><td className="font-medium"><span className="font-mono text-xs">{l.code}</span> {l.title_ar}</td><td>{m(a.original)}</td><td>{m(a.effectiveCredit)}{a.drift !== 0 && <span className="block text-[11px] text-destructive">فرق عن الأصلي+التعديلات: {m(a.drift)}</span>}</td>
              <td>{a.pendingCount ? <span className="text-amber-700">{a.pendingAmendments > 0 ? "+" : ""}{m(a.pendingAmendments)} ({a.pendingCount})</span> : "—"}</td><td>{a.suspended ? m(a.suspended) : "—"}</td><td>{l.kind === "expense" ? m(a.commitments) : "—"}</td><td>{l.kind === "expense" ? m(a.paidWithoutCommitment + a.unpaidDirectOrders) : "—"}</td><td className="font-bold text-primary">{a.available === null ? "—" : m(a.available)}</td></tr>); })}</tbody></table></div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">{totals.map((t) => <span key={t.currency} className="rounded-lg border px-3 py-1.5">{t.currency}: اعتماد {money(t.credit, t.currency)} · محجوز {money(t.reserved, t.currency)} · متاح <b>{money(t.available, t.currency)}</b>{t.pending !== 0 && ` · معلّق ${money(t.pending, t.currency)}`}</span>)}</div></>)}
    </Panel>

    {!closed && <div className="fill-odd grid gap-4 md:grid-cols-2">
      <Panel fold title="تعديل اعتماد مُصنَّف" sub="لكل نوع حقول إلزامية. من دون تاريخ تصديق صريح يبقى التعديل معلّقًا ولا يدخل في المتاح. لا تصديق حكمي.">
        <form action={amendTyped} className="grid gap-3">{back}
          <label className="space-y-1 text-sm font-medium">النوع<select name="type" required className={field}>{AMEND_TYPES.filter((t) => t !== "transfer").map((t) => <option key={t} value={t}>{AMEND_LABEL[t]}{DEFAULT_RULES[t].funding ? " — يلزم مصدر تمويل" : ""}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">البند<select name="line" required className={field}>{d.lines.map(lineOpt)}</select></label>
          <label className="space-y-1 text-sm font-medium">المبلغ (للنوع «معدَّل» أدخل سالبًا للنقصان؛ غيره موجب)<input name="amount" inputMode="decimal" required className={field} /></label>
          <label className="space-y-1 text-sm font-medium">السبب<input name="reason" required maxLength={500} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">قرار المجلس<select name="decision" className={field}><option value="">— (للأنواع التي لا تشترطه)</option>{decOpts}</select></label>
          <label className="space-y-1 text-sm font-medium">مصدر التمويل<input name="funding" maxLength={300} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">جهة التصديق / المرجع<input name="authority" maxLength={200} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ التصديق (فارغ = معلّق)<input name="validated" type="date" max={today()} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ النفاذ<input name="effective" type="date" className={field} /></label>
          <label className="space-y-1 text-sm font-medium">التاريخ<input name="date" type="date" defaultValue={today()} className={field} /></label>
          <button className={btn} disabled={d.lines.length === 0}>تسجيل التعديل</button>
          {d.rulesPending && <p className="text-xs text-muted-foreground">مصفوفة الحقول الإلزامية لكل نوع بانتظار المراجعة القانونية <ReviewBadge /></p>}
        </form>
      </Panel>
      <Panel fold title="نقل اعتماد بين بندين" sub="يُخفَّض المصدر ويُزاد الهدف معًا؛ يبقى الطرفان معلّقين حتى التصديق الصريح. المتاح في المصدر يجب أن يغطي المبلغ.">
        <form action={transferCredit} className="grid gap-3">{back}
          <label className="space-y-1 text-sm font-medium">من بند<select name="from" required className={field}>{expLines.map(lineOpt)}</select></label>
          <label className="space-y-1 text-sm font-medium">إلى بند (العملة نفسها)<select name="to" required className={field}>{expLines.map(lineOpt)}</select></label>
          <label className="space-y-1 text-sm font-medium">المبلغ<input name="amount" inputMode="decimal" required className={field} /></label>
          <label className="space-y-1 text-sm font-medium">السبب<input name="reason" required maxLength={500} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">قرار المجلس<select name="decision" required className={field}>{decOpts}</select></label>
          <label className="space-y-1 text-sm font-medium">جهة التصديق<input name="authority" maxLength={200} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ التصديق (فارغ = معلّق)<input name="validated" type="date" max={today()} className={field} /></label>
          <label className="space-y-1 text-sm font-medium">تاريخ النفاذ<input name="effective" type="date" required className={field} /></label>
          <label className="space-y-1 text-sm font-medium">التاريخ<input name="date" type="date" defaultValue={today()} className={field} /></label>
          <button className={btn} disabled={expLines.length < 2 || decs.length === 0}>تسجيل النقل</button>
        </form>
      </Panel>
    </div>}

    {pendingTyped.length > 0 && !closed && <Panel title="تعديلات بانتظار التصديق" sub="لا تدخل في المتاح قبل التصديق. تصديق أحد طرفي النقل يطبّق الطرفين معًا.">
      <ul className="divide-y text-sm">{pendingTyped.map((a) => { const l = lineOf(a.line_id); return (
        <li key={a.id} className="space-y-2 py-3"><div className="flex flex-wrap gap-x-3"><b>{Number(a.delta) > 0 ? "+" : ""}{money(Number(a.delta), l?.currency ?? "")}</b><span className="rounded-full border px-2 text-xs">{AMEND_LABEL[a.amendment_type as keyof typeof AMEND_LABEL] ?? a.amendment_type}</span><span>{l?.code} · {a.reason}</span></div>
          <form action={validateTyped} className="flex flex-wrap items-end gap-2">{back}<input type="hidden" name="amendment" value={a.id} />
            <label className="text-xs font-medium">تاريخ التصديق<input name="validated" type="date" required max={today()} defaultValue={today()} className={`${field} block`} /></label>
            <label className="text-xs font-medium">جهة التصديق<input name="authority" maxLength={200} defaultValue={a.authority ?? ""} className={`${field} block`} /></label><button className={btn}>تصديق وتطبيق</button></form></li>); })}</ul>
    </Panel>}

    {activeSusp.length > 0 && !closed && <Panel title="اعتمادات معلّقة (تخصم من المتاح)">
      <ul className="divide-y text-sm">{activeSusp.map((a) => { const l = lineOf(a.line_id); return <li key={a.id} className="flex flex-wrap items-end justify-between gap-2 py-2.5"><span><b>{money(Number(a.delta), l?.currency ?? "")}</b> · {l?.code} · {a.reason}</span>
        <form action={releaseSuspension}>{back}<input type="hidden" name="amendment" value={a.id} /><button className="min-h-11 rounded-xl border px-4 text-sm active:bg-muted">رفع التعليق</button></form></li>; })}</ul></Panel>}

    <Panel title="سجل تعديلات الاعتماد" sub="الأصلي ثم المعدَّل/المفتوح/المنقول/الإضافي/التكميلي/الاستثنائي/المُرحَّل/الساقط/المعلّق، والفعلي = الأصلي + المطبَّق.">
      {d.amendments.length === 0 ? <p className="text-sm text-muted-foreground">لا تعديلات مسجّلة.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>النوع</th><th>البند</th><th>القيمة</th><th>السبب</th><th>التمويل</th><th>الجهة</th><th>النفاذ</th><th>الحالة</th></tr></thead>
        <tbody className="divide-y">{d.amendments.slice(0, 60).map((a) => { const l = lineOf(a.line_id); return <tr key={a.id} className="[&>td]:px-2 [&>td]:py-2"><td>{AMEND_LABEL[a.amendment_type as keyof typeof AMEND_LABEL] ?? a.amendment_type}</td><td className="font-mono text-xs">{l?.code}</td><td className={Number(a.delta) < 0 ? "text-destructive" : ""}>{Number(a.delta) > 0 ? "+" : ""}{money(Number(a.delta), l?.currency ?? "")}</td><td>{a.reason}</td><td>{a.funding_source ?? "—"}</td><td>{a.authority ?? "—"}</td><td>{a.effective_on ?? "—"}</td><td>{!a.applied ? <span className="text-amber-700">معلّق</span> : a.amendment_type === "suspended" ? (a.suspension_released_on ? "مرفوع" : "قائم") : `مطبَّق ${a.validated_on ?? ""}`}</td></tr>; })}</tbody></table></div>}
    </Panel>

    <Panel fold title="إعدادات الدورة" sub="المدة المتممة قيمة تُدخل يدويًا ولا قيمة افتراضية لها؛ تبقى «يلزم تحقق» إلى أن يوثّقها مختص قانونيًا.">
      <form action={saveSettings} className="grid gap-3 sm:grid-cols-2">{back}
        <label className="space-y-1 text-sm font-medium">طول المدة المتممة (أيام) <ReviewBadge /><input name="supp_days" type="number" min={0} max={366} defaultValue={d.setting?.supplementary_period_days ?? ""} className={field} placeholder="غير محدَّدة" /></label>
        <label className="flex items-center gap-2 text-sm font-medium sm:pt-7"><input type="checkbox" name="verified" defaultChecked={d.setting?.supplementary_verified} className="size-5" />تحقّق منها مختص قانوني</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="require" defaultChecked={d.setting?.require_cycle_for_execution} className="size-5" />منع التنفيذ على أي سنة لا مسار دورة لها</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="freeze" defaultChecked={d.setting?.freeze_new_commitments ?? true} className="size-5" />تجميد الالتزامات الجديدة أثناء الإقفال <ReviewBadge /></label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">ملاحظة / مرجع المادة<input name="note" maxLength={500} className={field} /></label>
        <button className={`${btn} sm:col-span-2`}>حفظ</button>
      </form>
    </Panel>
    <p className="text-xs text-muted-foreground">لا تحتوي هذه الصفحة أي نص مادة قانونية؛ كل ضابط هنا بانتظار المراجعة القانونية (انظر سجل القواعد: BUD-CYCLE-*).</p>
  </>);
}
