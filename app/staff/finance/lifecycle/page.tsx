import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { btn, field, Panel } from "@/components/finance/Parts";
import { Extra, Hint } from "@/components/finance/simple";
import { Chip, Empty, Explain, Field, Intro, StepCard } from "@/components/simple/kit";
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
  const shell = (body: React.ReactNode) => <>{header}<main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><CycleNav current="lifecycle" year={year} /><Intro title={`دورة الموازنة وتعديلاتها — سنة ${year}`}>هنا تتابعون مراحل إقرار الموازنة، وترون كم بقي من المال في كل بند، وتسجّلون أي زيادة أو نقل من بند إلى آخر. خطوة واحدة في كل مرة.</Intro><CycleFlash ok={sp.ok} err={sp.err} />{body}</main></>;

  if (yq.error) return shell(<PendingNotice />);
  const openForm = (label: string) => (
    <form action={openCycle} className="flex flex-wrap items-end gap-2"><label className="text-base font-semibold">السنة المالية<input name="year" type="number" min={1990} max={2100} defaultValue={year} required className={`${field} block w-32`} /></label><button className={btn}>{label}</button></form>
  );
  if (!fy) return shell(<Empty action={openForm("ابدأ دورة موازنة لهذه السنة")}>لا توجد سنة مالية مفتوحة بعد. ابدأوا دورة موازنة لسنة جديدة وتُنشأ السنة المالية معها.</Empty>);

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
    {closed && <p role="status" className="rounded-2xl border-2 border-destructive/40 p-4 text-base font-medium leading-7">هذه السنة مقفلة: لا يمكن تعديل بنودها أو الالتزامات أو التعديلات. إعادة فتحها ممكنة فقط من صفحة «إقفال السنة» بمسار تصحيح موثّق.</p>}
    {d.partial && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">تعذّر تحميل جزء من البيانات؛ قد تكون الأرقام ناقصة.</p>}

    <Panel title="أين وصلت الموازنة؟" sub="للموازنة مراحل متتابعة لا يمكن تخطّي إحداها، وكل انتقال يُسجَّل. لا تصديق ضمنيًا: لا بد من تاريخ تصديق صريح.">
      {!c ? (
        <div className="space-y-3 text-sm"><p>لم يُفتح مسار دورة الموازنة لسنة {year}. {d.setting?.require_cycle_for_execution ? "التنفيذ الآن ممنوع على هذه السنة إلى حين فتح المسار وتسجيل أدلة الاعتماد والتصديق." : "لا أدلة اعتماد أو تصديق مسجَّلة؛ التنفيذ ما زال مسموحًا بحكم الإعداد الحالي، ويُنصح بفتح المسار."}</p>{openForm("فتح مسار الدورة")}</div>
      ) : (<div className="space-y-4">
        <Stepper stages={stages} current={c.status} dates={dates} />
        <div className={`rounded-xl border p-3 text-sm ${missing.length ? "border-destructive/40" : "border-[#2f7d4f]/50"}`}>
          <b>{missing.length ? "لا يمكن الصرف بعد. الناقص:" : <Chip tone="ok">أوراق الاعتماد والتصديق مكتملة</Chip>}</b>
          {missing.length > 0 && <ul className="mt-1 list-disc ps-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>}
          {d.adoption && <p className="mt-1 text-xs text-muted-foreground">قرار المجلس بالاعتماد: {d.adoption.decision_no}/{d.adoption.year} — {d.adoption.title}</p>}
          {c.validation_authority && <p className="text-xs text-muted-foreground">جهة التصديق: {c.validation_authority}{c.validated_on ? ` — ${c.validated_on}` : ""}</p>}
        </div>
        {next && !closed && (
          <form action={advanceCycle} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">{back}<input type="hidden" name="to" value={next} />
            <p className="text-lg font-bold sm:col-span-2">الخطوة التالية: {CYCLE_LABEL[next]}<span className="block text-sm font-normal text-muted-foreground">المطلوب لتسجيلها: {STAGE_EVIDENCE[next as Exclude<CycleStage, "preparation" | "closed">]}</span></p>
            <Field label="تاريخ هذه الخطوة" required><input name="date" type="date" required defaultValue={today()} max={today()} className={field} /></Field>
            {NEXT_NEEDS[next]?.decision && <Field label="قرار المجلس المعتمِد للموازنة" hint="اختاروا القرار الذي أقرّ الموازنة من سجل القرارات." required><select name="decision" required className={field}>{decOpts}</select></Field>}
            {NEXT_NEEDS[next]?.authority && <Field label="الجهة التي صدّقت" hint="الجهة الرقابية التي وافقت على الموازنة." example="المحافظ" required><input name="authority" required maxLength={200} className={field} /></Field>}
            <div className="sm:col-span-2"><Field label="ملاحظة أو رقم المستند (اختياري)"><input name="note" maxLength={500} className={field} /></Field></div>
            <button className={`${btn} sm:col-span-2`} disabled={next === "adopted" && decs.length === 0}>سجّل هذه الخطوة</button>
            {next === "adopted" && decs.length === 0 && <p className="text-xs text-destructive sm:col-span-2">لا يوجد قرار موازنة في سجل المجلس. سجّلوا القرار أولًا (فئة «موازنة») ثم عودوا إلى هنا.</p>}
          </form>)}
        {d.events.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold text-primary">سجل المراحل ({d.events.length})</summary><ul className="mt-2 divide-y">{d.events.map((e) => <li key={e.id} className="flex flex-wrap gap-x-3 py-1.5"><b>{CYCLE_LABEL[e.to_status as CycleStage] ?? e.to_status}</b><span className="text-muted-foreground">{e.event_date ?? ""}</span>{e.note && <span>{e.note}</span>}</li>)}</ul></details>}
      </div>)}
    </Panel>

    <Panel title="كم بقي من المال في كل بند؟" sub="المتاح = ما أُقرّ لهذا البند − ما حُجز أو صُرف منه. التعديلات التي لم تُصدَّق بعد لا تُحتسب هنا.">
      <div className="mb-3"><Explain term="الالتزام">الالتزام هو حجز جزء من المال لعقد أو طلب شراء قبل دفعه فعليًا، حتى لا يُصرف المبلغ نفسه مرتين.</Explain></div>
      {d.av.length === 0 ? <Empty>لا توجد بنود موازنة لهذه السنة بعد. أضيفوها من صفحة «الموازنة».</Empty> : (<>
        <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>البند</th><th>الأصلي</th><th>الاعتماد الفعلي</th><th>تعديلات معلّقة</th><th>معلَّق (تجميد)</th><th>الالتزامات</th><th>مدفوع بلا التزام / أوامر مباشرة</th><th>المتاح</th></tr></thead>
          <tbody className="divide-y">{d.av.map((a) => { const l = d.lines.find((q) => q.id === a.lineId)!; const m = (v: number) => money(v, a.currency); return (
            <tr key={a.lineId} className="[&>td]:px-2 [&>td]:py-2.5"><td className="font-medium"><span className="font-mono text-xs">{l.code}</span> {l.title_ar}</td><td>{m(a.original)}</td><td>{m(a.effectiveCredit)}{a.drift !== 0 && <span className="block text-[11px] text-destructive">فرق عن الأصلي+التعديلات: {m(a.drift)}</span>}</td>
              <td>{a.pendingCount ? <span className="text-amber-700">{a.pendingAmendments > 0 ? "+" : ""}{m(a.pendingAmendments)} ({a.pendingCount})</span> : "—"}</td><td>{a.suspended ? m(a.suspended) : "—"}</td><td>{l.kind === "expense" ? m(a.commitments) : "—"}</td><td>{l.kind === "expense" ? m(a.paidWithoutCommitment + a.unpaidDirectOrders) : "—"}</td><td className="font-bold text-primary">{a.available === null ? "—" : m(a.available)}</td></tr>); })}</tbody></table></div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">{totals.map((t) => <span key={t.currency} className="rounded-lg border px-3 py-1.5">{t.currency}: اعتماد {money(t.credit, t.currency)} · محجوز {money(t.reserved, t.currency)} · متاح <b>{money(t.available, t.currency)}</b>{t.pending !== 0 && ` · معلّق ${money(t.pending, t.currency)}`}</span>)}</div></>)}
    </Panel>

    {!closed && <div className="grid gap-4 lg:grid-cols-2">
      <StepCard n={1} title="زيادة أو تعديل اعتماد بند" hint="مثلًا: إضافة مبلغ لبند، أو تعليق جزء منه. يبقى التعديل «بانتظار التصديق» ولا يُحتسب قبل تاريخ تصديق صريح.">
        <form action={amendTyped} className="grid gap-3">{back}
          <Field label="نوع التعديل" required><select name="type" required className={field}>{AMEND_TYPES.filter((t) => t !== "transfer").map((t) => <option key={t} value={t}>{AMEND_LABEL[t]}{DEFAULT_RULES[t].funding ? " — يلزم مصدر تمويل" : ""}</option>)}</select></Field>
          <Field label="البند" required><select name="line" required className={field}>{d.lines.map(lineOpt)}</select></Field>
          <Field label="المبلغ" hint="اكتبوا المبلغ بالأرقام. للنقصان في نوع «معدَّل» اكتبوه بإشارة ناقص (−)." required><input name="amount" inputMode="decimal" required className={field} /></Field>
          <Field label="السبب" hint="جملة قصيرة تشرح لماذا هذا التعديل." required><input name="reason" required maxLength={500} className={field} /></Field>
          <Field label="قرار المجلس" hint="بعض الأنواع تتطلب قرارًا من المجلس؛ اتركوه فارغًا إن لم يُشترط."><select name="decision" className={field}><option value="">— لا قرار —</option>{decOpts}</select></Field>
          <Extra label="تفاصيل التمويل والتصديق والتواريخ (اختياري)">
            <Field label="مصدر التمويل"><input name="funding" maxLength={300} className={field} /></Field>
            <Field label="الجهة التي صدّقت" example="المحافظ"><input name="authority" maxLength={200} className={field} /></Field>
            <Field label="تاريخ التصديق" hint="اتركوه فارغًا إن لم يصدر التصديق بعد؛ يبقى التعديل بانتظاره."><input name="validated" type="date" max={today()} className={field} /></Field>
            <Field label="تاريخ بدء السريان"><input name="effective" type="date" className={field} /></Field>
            <Field label="تاريخ التسجيل"><input name="date" type="date" defaultValue={today()} className={field} /></Field>
          </Extra>
          <button className={btn} disabled={d.lines.length === 0}>سجّل التعديل</button>
          {d.rulesPending && <Hint>قائمة الحقول المطلوبة لكل نوع ما زالت بانتظار المراجعة القانونية <ReviewBadge /></Hint>}
        </form>
      </StepCard>
      <StepCard n={2} title="نقل مبلغ من بند إلى بند" hint="يُنقص البند الأول ويزيد الثاني معًا، ويبقى الطرفان بانتظار التصديق. يجب أن يكفي المتاح في البند الأول.">
        <form action={transferCredit} className="grid gap-3">{back}
          <Field label="من أي بند؟" required><select name="from" required className={field}>{expLines.map(lineOpt)}</select></Field>
          <Field label="إلى أي بند؟" hint="بالعملة نفسها." required><select name="to" required className={field}>{expLines.map(lineOpt)}</select></Field>
          <Field label="المبلغ" required><input name="amount" inputMode="decimal" required className={field} /></Field>
          <Field label="السبب" required><input name="reason" required maxLength={500} className={field} /></Field>
          <Field label="قرار المجلس بالنقل" hint="النقل بين البنود يحتاج قرارًا من المجلس." required><select name="decision" required className={field}>{decOpts}</select></Field>
          <Field label="تاريخ بدء السريان" required><input name="effective" type="date" required className={field} /></Field>
          <Extra label="التصديق والتاريخ (اختياري)">
            <Field label="الجهة التي صدّقت"><input name="authority" maxLength={200} className={field} /></Field>
            <Field label="تاريخ التصديق" hint="فارغ = بانتظار التصديق."><input name="validated" type="date" max={today()} className={field} /></Field>
            <Field label="تاريخ التسجيل"><input name="date" type="date" defaultValue={today()} className={field} /></Field>
          </Extra>
          <button className={btn} disabled={expLines.length < 2 || decs.length === 0}>سجّل النقل</button>
          {decs.length === 0 && <Hint>لا يوجد قرار في سجل المجلس بعد؛ سجّلوا قرار النقل أولًا.</Hint>}
        </form>
      </StepCard>
    </div>}

    {pendingTyped.length > 0 && !closed && <Panel title="تعديلات بانتظار التصديق" sub="لا تُحتسب قبل التصديق. عند تصديق أحد طرفي النقل يُطبَّق الطرفان معًا.">
      <ul className="divide-y text-sm">{pendingTyped.map((a) => { const l = lineOf(a.line_id); return (
        <li key={a.id} className="space-y-2 py-3"><div className="flex flex-wrap gap-x-3"><b>{Number(a.delta) > 0 ? "+" : ""}{money(Number(a.delta), l?.currency ?? "")}</b><span className="rounded-full border px-2 text-xs">{AMEND_LABEL[a.amendment_type as keyof typeof AMEND_LABEL] ?? a.amendment_type}</span><span>{l?.code} · {a.reason}</span></div>
          <form action={validateTyped} className="flex flex-wrap items-end gap-2">{back}<input type="hidden" name="amendment" value={a.id} />
            <label className="text-base font-semibold">تاريخ التصديق<input name="validated" type="date" required max={today()} defaultValue={today()} className={`${field} block`} /></label>
            <label className="text-base font-semibold">الجهة التي صدّقت<input name="authority" maxLength={200} defaultValue={a.authority ?? ""} className={`${field} block`} /></label><button className={btn}>صدّق وطبّق</button></form></li>); })}</ul>
    </Panel>}

    {activeSusp.length > 0 && !closed && <Panel title="مبالغ مجمَّدة مؤقتًا" sub="هذه المبالغ مخصومة من المتاح إلى أن يُرفع التجميد.">
      <ul className="divide-y text-sm">{activeSusp.map((a) => { const l = lineOf(a.line_id); return <li key={a.id} className="flex flex-wrap items-end justify-between gap-2 py-2.5"><span><b>{money(Number(a.delta), l?.currency ?? "")}</b> · {l?.code} · {a.reason}</span>
        <form action={releaseSuspension}>{back}<input type="hidden" name="amendment" value={a.id} /><button className="min-h-11 rounded-xl border px-4 text-sm active:bg-muted">ارفع التجميد</button></form></li>; })}</ul></Panel>}

    <Panel fold title="سجل كل التعديلات السابقة" sub="الاعتماد الفعلي للبند = المبلغ الأصلي + التعديلات التي صُدّق عليها.">
      {d.amendments.length === 0 ? <Empty>لا توجد تعديلات مسجّلة بعد.</Empty> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start"><th>النوع</th><th>البند</th><th>القيمة</th><th>السبب</th><th>التمويل</th><th>الجهة</th><th>النفاذ</th><th>الحالة</th></tr></thead>
        <tbody className="divide-y">{d.amendments.slice(0, 60).map((a) => { const l = lineOf(a.line_id); return <tr key={a.id} className="[&>td]:px-2 [&>td]:py-2"><td>{AMEND_LABEL[a.amendment_type as keyof typeof AMEND_LABEL] ?? a.amendment_type}</td><td className="font-mono text-xs">{l?.code}</td><td className={Number(a.delta) < 0 ? "text-destructive" : ""}>{Number(a.delta) > 0 ? "+" : ""}{money(Number(a.delta), l?.currency ?? "")}</td><td>{a.reason}</td><td>{a.funding_source ?? "—"}</td><td>{a.authority ?? "—"}</td><td>{a.effective_on ?? "—"}</td><td>{!a.applied ? <span className="text-amber-700">معلّق</span> : a.amendment_type === "suspended" ? (a.suspension_released_on ? "مرفوع" : "قائم") : `مطبَّق ${a.validated_on ?? ""}`}</td></tr>; })}</tbody></table></div>}
    </Panel>

    <Panel fold title="إعدادات الدورة (للمختصين)" sub="المدة الإضافية لإنهاء المعاملات تُدخل يدويًا ولا قيمة افتراضية لها؛ وتبقى «يلزم تحقق» إلى أن يوثّقها مختص قانوني.">
      <form action={saveSettings} className="grid gap-3 sm:grid-cols-2">{back}
        <label className="space-y-1 text-sm font-medium">المدة الإضافية بعد نهاية السنة (بالأيام) <ReviewBadge /><input name="supp_days" type="number" min={0} max={366} defaultValue={d.setting?.supplementary_period_days ?? ""} className={field} placeholder="غير محدَّدة" /></label>
        <label className="flex items-center gap-2 text-sm font-medium sm:pt-7"><input type="checkbox" name="verified" defaultChecked={d.setting?.supplementary_verified} className="size-5" />تحقّق منها مختص قانوني (المدة أعلاه)</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="require" defaultChecked={d.setting?.require_cycle_for_execution} className="size-5" />منع الصرف على أي سنة لم تُفتح دورة موازنتها</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="freeze" defaultChecked={d.setting?.freeze_new_commitments ?? true} className="size-5" />منع حجز مبالغ جديدة أثناء إقفال السنة <ReviewBadge /></label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">ملاحظة أو مرجع (اختياري)<input name="note" maxLength={500} className={field} /></label>
        <button className={`${btn} sm:col-span-2`}>احفظ الإعدادات</button>
      </form>
    </Panel>
    <p className="text-xs text-muted-foreground">ملاحظة: لا تتضمن هذه الصفحة أي نص قانوني، وكل ضابط فيها بانتظار مراجعة المختص القانوني (راجعوا «المرجعية القانونية»).</p>
  </>);
}
