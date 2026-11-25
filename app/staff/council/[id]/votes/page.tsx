import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import VotesForm from "@/components/council/VotesForm";
import { uuidOk } from "@/lib/council";
import { MAJORITY_KIND, MAJORITY_LABEL, RESULT, VOTE } from "@/lib/votes";
import { recordVotes, setMajorityRule } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "التصويت — جلسة المجلس — BALADI ONE", referrer: "no-referrer" as const };
const ERR: Record<string, string> = {
  attendance_required: "سجّل عدد الأعضاء والحاضرين في صفحة الجلسة أولًا.", session_locked: "الجلسة مقفلة (المحضر معتمد أو الجلسة ملغاة).", too_many_members: "عدد المصوّتين يتجاوز عدد أعضاء المجلس.",
  present_exceeds_session: "حاضرو البند أكثر من الحضور المسجّل للجلسة.", recusal_reason_required: "سبب التنحي مطلوب.", duplicate_member: "اسم عضو مكرّر في البند.", result_matches_counts: "النتيجة المعلنة تناقض عدد الأصوات.",
  unavailable: "قيد التفعيل: ترحيل التصويت (0026) لم يُطبَّق بعد.", forbidden: "هذا الإجراء للمدير فقط.", "1": "تحقق من الحقول ثم أعد المحاولة." };
const CAT: Record<string, string> = { general: "عام", budget: "موازنة", accounts: "حسابات", planning: "تنظيم مدني/تخطيط", loan: "قرض", transfer: "نقل اعتمادات", tax: "رسوم وضرائب", contract: "عقد/لزمة", property: "أملاك/إيجار", other: "أخرى" };
const field = "min-h-11 rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

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
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-2xl font-bold">تصويت الأعضاء — {s.title}{s.session_no ? ` (${s.session_no})` : ""}</h1><p className="text-xs text-muted-foreground">الأعضاء {s.members_total ?? "غير مسجَّل"} · الحاضرون {s.members_present ?? "غير مسجَّل"}</p></div>
        <Link href={`/staff/council/${id}/votes/minutes`} className="rounded-xl border px-4 py-2 text-sm font-semibold text-primary active:bg-muted">المحضر ←</Link></div>
      {sp.ok && <p role="status" className="rounded-xl border border-green-600/40 p-3 text-sm">تم الحفظ.</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{ERR[sp.err] ?? ERR["1"]}</p>}
      {!ready && <p role="status" className="rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950">قيد التفعيل: جداول التصويت غير متاحة بعد (الترحيل 0026 لم يُطبَّق). لا يمكن تسجيل الأصوات حاليًا.</p>}
      {ready && (s.members_total === null || s.members_present === null) && <p role="alert" className="rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950">الحضور غير مسجَّل لهذه الجلسة: لا يمكن حفظ الأصوات قبل <Link href={`/staff/council/${id}`} className="font-bold underline">تسجيل عدد الأعضاء والحاضرين</Link>.</p>}
      {locked && <p className="rounded-xl border p-3 text-sm">الجلسة مقفلة: لا يمكن تعديل الأصوات.</p>}

      {ready && (ag.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا بنود في جدول الأعمال بعد.</p>}
      {ready && (ag.data ?? []).map((a) => {
        const r: any = results.get(a.id);
        const rows = (vt.data ?? []).filter((v: any) => v.agenda_item_id === a.id).map((v: any) => ({ member: v.member_name, vote: v.vote, reason: v.recusal_reason }));
        return (
          <section key={a.id} id={`i-${a.id}`} className={`elev space-y-3 rounded-2xl border bg-background p-4 ${sp.item === a.id ? "ring-2 ring-primary" : ""}`}>
            <h2 className="font-bold">{a.position}. {a.title}</h2>
            {r ? <p className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-accent px-3 py-1 font-bold text-primary">{RESULT[r.result]}{r.tie_break_by_chair ? " (بترجيح الرئيس)" : ""}</span><span>مع {r.votes_for} · ضد {r.votes_against} · امتناع {r.votes_abstain} · تنحٍّ {r.votes_recused} · غائب {r.votes_absent}</span><span className="text-muted-foreground">الحاضرون {r.present_count} من {r.total_members}</span><span className="text-xs text-muted-foreground">الأغلبية المطلوبة: {MAJORITY_LABEL(r.required_majority, r.majority_verification)}</span></p> : <p className="text-sm text-muted-foreground">لم تُسجَّل الأصوات بعد.</p>}
            {r?.result_note && <p className="text-xs text-muted-foreground">{r.result_note}</p>}
            {rows.some((x) => x.vote === "recused") && <ul className="text-xs text-muted-foreground">{rows.filter((x) => x.vote === "recused").map((x) => <li key={x.member}>{x.member}: تنحٍّ — {x.reason}</li>)}</ul>}
            {!locked && (
              <details className="rounded-xl border p-3" open={sp.item === a.id && !!sp.err}><summary className="cursor-pointer text-sm font-bold text-primary">{r ? "تعديل الأصوات" : "تسجيل الأصوات"}</summary>
                <div className="mt-3"><VotesForm action={recordVotes} sessionId={id} agendaId={a.id} total={s.members_total} present={s.members_present} initial={rows} rules={rules} initialCategory={r?.decision_category ?? null} initialResult={r?.result ?? null} initialTieBreak={r?.tie_break_by_chair ?? false} initialNote={r?.result_note ?? null} /></div>
              </details>)}
          </section>);
      })}

      {ready && (
        <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold">الأغلبية المطلوبة حسب نوع القرار</summary>
          <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs leading-6 text-amber-950">لم تُحمَّل أي أغلبية من نص قانوني: كل قيمة «{`يلزم تحقق`}» حتى يؤكدها مدير مختص. لا أغلبية افتراضية.</p>
          <ul className="mt-3 divide-y text-sm">{rules.map((r) => (
            <li key={r.category} className="space-y-2 py-2"><p><b>{CAT[r.category] ?? r.category}</b> — {MAJORITY_LABEL(r.majority_kind, r.verification)}{r.majority_note ? ` · ${r.majority_note}` : ""}</p>
              {isAdmin && <form action={setMajorityRule} className="flex flex-wrap items-center gap-2"><input type="hidden" name="session" value={id} /><input type="hidden" name="category" value={r.category} />
                <select name="kind" defaultValue={r.majority_kind ?? ""} aria-label="نوع الأغلبية" className={field}><option value="">غير محدد</option>{Object.entries(MAJORITY_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input name="note" defaultValue={r.majority_note ?? ""} maxLength={1000} placeholder="المرجع/الملاحظة" aria-label="ملاحظة" className={`${field} min-w-48 flex-1`} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="verified" defaultChecked={r.verification === "verified"} className="size-4" />تحقّق قانونيًا</label>
                <button className="min-h-11 rounded-xl border px-3 text-sm active:bg-muted">حفظ</button></form>}
            </li>))}</ul></details>)}
      <p className="text-xs text-muted-foreground">{Object.values(VOTE).join(" · ")}</p>
    </main></>
  );
}
