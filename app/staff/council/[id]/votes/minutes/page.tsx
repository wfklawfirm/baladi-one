import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { uuidOk } from "@/lib/council";
import { BTN_PRIMARY, BTN_SECONDARY, CONTROL, Chip, Explain, Intro, Notice, StepCard, Field } from "@/components/simple/kit";
import { approveMinutes, attachSignedMinutes, correctMinutes, saveMinutes, setMinutesConfidential } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "محضر الجلسة — BALADI ONE", referrer: "no-referrer" as const };
const ST: Record<string, string> = { draft: "مسودة", approved: "معتمد", signed: "نسخة موقّعة مسجَّلة" };
const ERR: Record<string, string> = { minutes_locked: "المحضر المعتمد لا يُعدَّل مباشرة: استخدم سجل التصحيحات.", minutes_not_approved: "اعتمد المحضر أولًا.", minutes_still_draft: "المحضر ما زال مسودة: عدّله مباشرة.", unavailable: "قيد التفعيل: ترحيل المحاضر (0026) لم يُطبَّق بعد.", session_locked: "الجلسة ملغاة.", "1": "تحقق من الحقول ثم أعد المحاولة." };
const OK: Record<string, string> = { saved: "حُفظت نسخة جديدة من المسودة.", approved: "سُجِّل اعتماد المحضر.", signed: "سُجِّل مرجع النسخة الموقّعة.", corrected: "أُضيف التصحيح إلى السجل.", conf: "تم تحديث السرّية." };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));

export default async function MinutesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data: s } = await sb.from("council_session").select("id,session_no,title,held_on,status,minutes_text").eq("id", id).maybeSingle();
  if (!s) notFound();
  const h = await sb.from("council_minutes").select("*").eq("session_id", id).maybeSingle();
  const unavailable = !!h.error;
  const head: any = h.data;
  const [vs, cs] = head ? await Promise.all([
    sb.from("council_minutes_version").select("version,body,saved_at").eq("session_id", id).order("version", { ascending: false }),
    sb.from("council_minutes_correction").select("*").eq("session_id", id).order("seq"),
  ]) : [null, null];
  const versions = (vs?.data ?? []) as { version: number; body: string; saved_at: string }[];
  const latest = versions[0];
  const approved = versions.find((v) => v.version === head?.approved_version);
  const draft = !head || head.status === "draft";
  return (
    <><StaffHeader back={`/staff/council/${id}/votes`} backLabel="التصويت" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <Intro title={`محضر الجلسة — ${s.title}${s.session_no ? ` (${s.session_no})` : ""}`}>المحضر هو الوثيقة الرسمية لما جرى في الجلسة. اكتبوا المسودة، ثم اعتمدوها، ثم سجّلوا مرجع النسخة الموقّعة. بعد الاعتماد لا يتغير النص، وأي خطأ يُصحَّح بإضافة تصحيح.</Intro>
      <p className="flex flex-wrap gap-2"><Chip tone={!head ? "wait" : head.status === "draft" ? "wait" : "ok"}>{head ? ST[head.status] : "لا محضر بعد"}</Chip>{head?.confidential && <Chip tone="info">🔒 سرّي</Chip>}</p>
      {sp.ok && <Notice>{OK[sp.ok] ?? "تم."}</Notice>}
      {sp.err && <Notice tone="bad">{ERR[sp.err] ?? ERR["1"]}</Notice>}
      {unavailable && <Notice>ميزة المحاضر قيد التفعيل ولم تُفتح بعد. يبقى حقل «المحضر» في صفحة الجلسة هو المعتمد حاليًا.</Notice>}

      {!unavailable && draft && (<>
        <StepCard n={1} title="اكتبوا المسودة" hint="كل حفظ ينشئ نسخة جديدة محفوظة في السجل، فلا يضيع شيء.">
          <form action={saveMinutes} className="space-y-3"><input type="hidden" name="session" value={id} />
            <Field label="نص المحضر" required hint="ما نوقش في الجلسة وما تقرر في كل بند." example="افتتح الرئيس الجلسة، وتمت الموافقة على البند الأول بالأغلبية…">
              <textarea name="body" required defaultValue={latest?.body ?? s.minutes_text ?? ""} rows={14} maxLength={60000} className={`${CONTROL} min-h-60 py-3 leading-7`} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confidential" defaultChecked={head?.confidential ?? false} className="size-5" />محضر سرّي (لا يراه إلا الرئيس والمدير)</label>
            <button className={BTN_SECONDARY}>حفظ المسودة</button></form>
        </StepCard>
        {head && head.current_version >= 1 && (
          <StepCard n={2} title="اعتمدوا المحضر" hint="الاعتماد قراركم أنتم، ويُسجَّل باسمكم. بعده لا يُعدَّل النص مباشرة.">
            <Explain term="ماذا يحدث عند الاعتماد؟">تُقفل النسخة {head.current_version} كنص رسمي. إن وجدتم خطأً بعدها تضيفونه كتصحيح مع السبب، ولا يُحذف شيء من السجل.</Explain>
            <form action={approveMinutes}><input type="hidden" name="session" value={id} /><button className={BTN_PRIMARY}>اعتماد النسخة {head.current_version}</button></form>
          </StepCard>)}
      </>)}

      {head && !draft && (
        <StepCard title={`النص المعتمد (النسخة ${head.approved_version})`} hint={`اعتُمد ${head.approved_at ? fmt(head.approved_at) : ""}. لا تعديل مباشر؛ التصحيحات أدناه تُضاف ولا تُحذف.`}>
          <pre className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm leading-7">{approved?.body ?? "—"}</pre>
          <form action={setMinutesConfidential}><input type="hidden" name="session" value={id} /><input type="hidden" name="flag" value={head.confidential ? "0" : "1"} /><button className={BTN_SECONDARY}>{head.confidential ? "إلغاء السرّية" : "وسم المحضر سرّيًا"}</button></form>
        </StepCard>)}

      {head?.status === "approved" && (
        <StepCard n={3} title="سجّلوا مرجع النسخة الموقّعة" hint="التوقيع يتم على الورق خارج النظام. هنا تسجّلون فقط رقم الأرشفة أو الرابط الذي يدل عليها.">
          <form action={attachSignedMinutes} className="space-y-3">
            <input type="hidden" name="session" value={id} />
            <Field label="رقم الأرشفة أو الرابط" required hint="لا يُرفع ملف هنا، ولا يمكن تغيير المرجع بعد تسجيله." example="أرشيف 2026/45"><input name="ref" required maxLength={500} className={CONTROL} /></Field>
            <button className={BTN_SECONDARY}>تسجيل المرجع</button></form>
        </StepCard>)}
      {head?.status === "signed" && <Notice>النسخة الموقّعة مسجَّلة: <b>{head.signed_copy_ref}</b></Notice>}

      {head && !draft && (
        <StepCard n={4} title={`التصحيحات (${(cs?.data ?? []).length})`} hint="إن ظهر خطأ في المحضر المعتمد فأضيفوا تصحيحًا. يبقى النص الأصلي ظاهرًا ومشطوبًا.">
          {(cs?.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا توجد تصحيحات. هذا طبيعي.</p>}
          <ol className="space-y-2 text-sm">{(cs?.data ?? []).map((c: any) => (
            <li key={c.id} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">#{c.seq} · على النسخة {c.version_ref} · {fmt(c.entered_at)}{c.section_ref ? ` · ${c.section_ref}` : ""}</p>
              {c.original_text && <p className="line-through opacity-70">{c.original_text}</p>}<p>{c.corrected_text}</p><p className="text-xs">السبب: {c.reason}{c.authority_ref ? ` · المرجع: ${c.authority_ref}` : ""}</p></li>))}</ol>
          <details className="rounded-2xl border-2 p-3"><summary className="cursor-pointer text-base font-bold text-primary">إضافة تصحيح</summary>
            <form action={correctMinutes} className="mt-4 space-y-3"><input type="hidden" name="session" value={id} />
              <Field label="النص بعد التصحيح" required example="حضر ثمانية أعضاء وليس سبعة."><textarea name="corrected" required rows={3} maxLength={5000} className={`${CONTROL} py-3`} /></Field>
              <Field label="سبب التصحيح" required example="خطأ في عدّ الحاضرين"><input name="reason" required maxLength={1000} className={CONTROL} /></Field>
              <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">حقول إضافية</summary>
                <div className="mt-3 space-y-3">
                  <Field label="مكان الخطأ في المحضر" hint="اختياري"><input name="section" maxLength={300} className={CONTROL} /></Field>
                  <Field label="النص الأصلي الخاطئ" hint="اختياري"><textarea name="original" rows={2} maxLength={5000} className={`${CONTROL} py-3`} /></Field>
                  <Field label="مرجع إقرار التصحيح" hint="رقم جلسة أو قرار للمجلس أقرّ التصحيح. الإجراء القانوني للتصحيح يحتاج تحققًا من المحامي."><input name="authority" maxLength={500} className={CONTROL} /></Field>
                </div></details>
              <button className={BTN_PRIMARY}>إضافة التصحيح</button></form></details>
        </StepCard>)}

      {versions.length > 0 && (
        <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold">سجل النسخ ({versions.length})</summary>
          <ul className="mt-3 space-y-2 text-sm">{versions.map((v) => <li key={v.version} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">النسخة {v.version} · {fmt(v.saved_at)}{v.version === head?.approved_version ? " · المعتمدة" : ""}</p><p className="line-clamp-3 whitespace-pre-wrap">{v.body}</p></li>)}</ul></details>)}
      <Link href={`/staff/council/${id}`} className={BTN_SECONDARY}>← صفحة الجلسة</Link>
    </main></>
  );
}
