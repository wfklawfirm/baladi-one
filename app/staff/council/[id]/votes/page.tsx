import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import VotesForm from "@/components/council/VotesForm";
import { uuidOk } from "@/lib/council";
import { MAJORITY_KIND, MAJORITY_LABEL, RESULT, VOTE } from "@/lib/votes";
import { recordVotes, setMajorityRule } from "../../actions";
import { BTN_PRIMARY, BTN_SECONDARY, CONTROL, Chip, Empty, Explain, Intro, Notice, StepCard } from "@/components/simple/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "التصويت — جلسة المجلس — BALADI ONE", referrer: "no-referrer" as const };
const ERR: Record<string, string> = {
  attendance_required: "سجّل عدد الأعضاء والحاضرين في صفحة الجلسة أولًا.", session_locked: "الجلسة مقفلة (المحضر معتمد أو الجلسة ملغاة).", too_many_members: "عدد المصوّتين يتجاوز عدد أعضاء المجلس.",
  present_exceeds_session: "حاضرو البند أكثر من الحضور المسجّل للجلسة.", recusal_reason_required: "سبب التنحي مطلوب.", duplicate_member: "اسم عضو مكرّر في البند.", result_matches_counts: "النتيجة المعلنة تناقض عدد الأصوات.",
  unavailable: "ميزة التصويت قيد التفعيل ولم تُفتح بعد.", forbidden: "هذا الإجراء لمدير النظام فقط.", "1": "بعض الحقول ناقصة أو غير صحيحة. راجعوها ثم أعيدوا المحاولة." };
const CAT: Record<string, string> = { general: "عام", budget: "موازنة", accounts: "حسابات", planning: "تنظيم مدني/تخطيط", loan: "قرض", transfer: "نقل اعتمادات", tax: "رسوم وضرائب", contract: "عقد/لزمة", property: "أملاك/إيجار", other: "أخرى" };

export default async function VotesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; ok?: string; item?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const isAdmin = memberships.some((m) => m.role === "admin");
  const sp = await searchParams;
  const { data: s } = await sb.from("council_session").select("id,session_no,title,held_on,status,members_total,members_present").eq("id", id).maybeSingle();
  if (!s) notFound();
  const ag = await sb.from("agenda_item").select("id,position,title").eq("session_id", id).order("position");
  const agIds = (ag.data ?? []).map((a) => a.id);
  const [res, vt, mr] = await Promise.all([
    sb.from("council_agenda_result").select("*").eq("session_id", id),
    sb.from("council_vote").select("agenda_item_id,member_name,vote,recusal_reason,id").in("agenda_item_id", agIds).order("recorded_at"),
    sb.from("council_majority_rule").select("category,majority_kind,majority_note,verification").order("category"),
  ]);
  const ready = !res.error && !vt.error && !mr.error;
  const results = new Map((res.data ?? []).map((r: any) => [r.agenda_item_id, r]));
  const rules = (mr.data ?? []) as { category: string; majority_kind: string | null; majority_note: string | null; verification: string }[];
  const locked = s.status === "minutes_approved" || s.status === "cancelled";
  return (
    <><StaffHeader back={`/staff/council/${id}`} backLabel="الجلسة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <Intro title={`تصويت الأعضاء — ${s.title}${s.session_no ? ` (${s.session_no})` : ""}`}>لكل بند من جدول الأعمال: سجّلوا رأي كل عضو ثم احفظوا، وسيظهر لكم عدد الأصوات والنتيجة. الأعضاء {s.members_total ?? "؟"} والحاضرون {s.members_present ?? "؟"}.</Intro>
      <Link href={`/staff/council/${id}/votes/minutes`} className={BTN_SECONDARY}>الخطوة التالية: المحضر ←</Link>
      {sp.ok && <Notice>تم حفظ التصويت. يمكنكم الانتقال إلى البند التالي أو إلى المحضر.</Notice>}
      {sp.err && <Notice tone="bad">{ERR[sp.err] ?? ERR["1"]}</Notice>}
      {!ready && <Notice tone="bad">ميزة التصويت قيد التفعيل ولم تُفتح بعد، فلا يمكن تسجيل الأصوات الآن.</Notice>}
      {ready && (s.members_total === null || s.members_present === null) && <Notice tone="bad">لم يُسجَّل عدد الأعضاء والحاضرين لهذه الجلسة، ولا يمكن حفظ الأصوات قبل ذلك. <Link href={`/staff/council/${id}`} className="font-bold underline">سجّلوهما من صفحة الجلسة</Link>.</Notice>}
      {locked && <Notice tone="bad">الجلسة مقفلة (المحضر معتمد أو الجلسة ملغاة)، فلا يمكن تعديل الأصوات.</Notice>}

      {ready && (ag.data ?? []).length === 0 && <Empty action={<Link href={`/staff/council/${id}#agenda`} className={BTN_PRIMARY}>أضيفوا بنود جدول الأعمال</Link>}>لا توجد بنود في جدول أعمال هذه الجلسة بعد.</Empty>}
      {ready && (ag.data ?? []).map((a) => {
        const r: any = results.get(a.id);
        const rows = (vt.data ?? []).filter((v: any) => v.agenda_item_id === a.id).map((v: any) => ({ member: v.member_name, vote: v.vote, reason: v.recusal_reason }));
        return (
          <div key={a.id} id={`i-${a.id}`} className={sp.item === a.id ? "rounded-3xl ring-2 ring-primary" : ""}>
          <StepCard n={a.position} title={a.title} hint={r ? undefined : "لم تُسجَّل الأصوات على هذا البند بعد."}>
            {r && <div className="space-y-2"><p className="flex flex-wrap gap-2"><Chip tone={r.result === "carried" ? "ok" : r.result === "not_carried" ? "bad" : "wait"}>{RESULT[r.result]}{r.tie_break_by_chair ? " (بترجيح الرئيس)" : ""}</Chip><Chip>مع {r.votes_for}</Chip><Chip>ضد {r.votes_against}</Chip><Chip>امتناع {r.votes_abstain}</Chip>{r.votes_recused > 0 && <Chip>تنحٍّ {r.votes_recused}</Chip>}{r.votes_absent > 0 && <Chip>غائب {r.votes_absent}</Chip>}</p>
              <p className="text-sm text-muted-foreground">الحاضرون {r.present_count} من {r.total_members} · الأغلبية المطلوبة: {MAJORITY_LABEL(r.required_majority, r.majority_verification)}</p></div>}
            {r?.result_note && <p className="text-sm text-muted-foreground">{r.result_note}</p>}
            {rows.some((x) => x.vote === "recused") && <ul className="text-sm text-muted-foreground">{rows.filter((x) => x.vote === "recused").map((x) => <li key={x.member}>{x.member}: تنحّى — {x.reason}</li>)}</ul>}
            {!locked && (
              <details className="rounded-2xl border-2 p-3" open={(sp.item === a.id && !!sp.err) || !r}><summary className="cursor-pointer text-base font-bold text-primary">{r ? "عدّلوا الأصوات" : "سجّلوا الأصوات"}</summary>
                <div className="mt-4"><VotesForm action={recordVotes} sessionId={id} agendaId={a.id} total={s.members_total} present={s.members_present} initial={rows} rules={rules} initialCategory={r?.decision_category ?? null} initialResult={r?.result ?? null} initialTieBreak={r?.tie_break_by_chair ?? false} initialNote={r?.result_note ?? null} /></div>
              </details>)}
          </StepCard></div>);
      })}

      {ready && (
        <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold">الأغلبية المطلوبة حسب نوع القرار</summary>
          <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs leading-6 text-amber-950">لم تُحمَّل أي أغلبية من نص قانوني: كل قيمة «{`يلزم تحقق`}» حتى يؤكدها مدير مختص. لا أغلبية افتراضية.</p>
          <ul className="mt-3 divide-y text-sm">{rules.map((r) => (
            <li key={r.category} className="space-y-2 py-2"><p><b>{CAT[r.category] ?? r.category}</b> — {MAJORITY_LABEL(r.majority_kind, r.verification)}{r.majority_note ? ` · ${r.majority_note}` : ""}</p>
              {isAdmin && <form action={setMajorityRule} className="flex flex-wrap items-center gap-2"><input type="hidden" name="session" value={id} /><input type="hidden" name="category" value={r.category} />
                <select name="kind" defaultValue={r.majority_kind ?? ""} aria-label="نوع الأغلبية" className={CONTROL}><option value="">غير محدد</option>{Object.entries(MAJORITY_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input name="note" defaultValue={r.majority_note ?? ""} maxLength={1000} placeholder="المرجع/الملاحظة" aria-label="ملاحظة" className={`${CONTROL} min-w-48 flex-1`} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="verified" defaultChecked={r.verification === "verified"} className="size-4" />تحقّق قانونيًا</label>
                <button className="min-h-11 rounded-xl border px-3 text-sm active:bg-muted">حفظ</button></form>}
            </li>))}</ul></details>)}
      <p className="text-xs text-muted-foreground">{Object.values(VOTE).join(" · ")}</p>
    </main></>
  );
}
