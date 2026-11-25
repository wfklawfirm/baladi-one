import Link from "next/link";
import { redirect } from "next/navigation";
import StaffHeader from "@/components/StaffHeader";
import { requireStaff } from "@/lib/supabase-server";
import { REVIEW, SURE } from "@/components/legal/LegalPanel";
import { Intro, StepCard, Field, Chip, Empty, Notice, Explain, CONTROL, BTN_PRIMARY, BTN_SECONDARY } from "@/components/simple/kit";
import { addLegalUpdate, reviewLegalUpdate, reviewRule } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "مستجدات التشريع — BALADI ONE", referrer: "no-referrer" as const };
const ST: Record<string, [string, "ok" | "wait" | "bad" | "info"]> = { received: ["وصل ولم يُراجَع", "wait"], under_review: ["قيد المراجعة", "wait"], approved: ["تمت الموافقة", "ok"], rejected: ["مرفوض", "bad"] };
const ERR: Record<string, string> = { forbidden: "هذا الإجراء للمدير (المراجع القانوني) فقط.", note_required: "الملاحظة مطلوبة.", unknown_rule: "قاعدة غير موجودة في السجل.", already_decided: "تم البت في هذا المستجد.", original_text_required: "لا يمكن اعتماد قاعدة «مراجَعة» قبل تحميل نصها الأصلي.", no_change: "الحالة نفسها، لا تغيير.", unavailable: "قيد التفعيل: ترحيل المستجدات (0026) لم يُطبَّق بعد.", "1": "تحقق من الحقول ثم أعد المحاولة." };
const OK: Record<string, string> = { added: "سُجّل المستجد.", reviewed: "سُجّل القرار على المستجد. لم تتغير أي قاعدة.", rule: "سُجّلت مراجعة القاعدة في سجل التاريخ." };
const field = CONTROL;

export default async function LegalUpdates({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  const isAdmin = memberships.some((m) => m.role === "admin");
  const sp = await searchParams;
  const [up, rl, hs] = await Promise.all([
    sb.from("legal_update").select("*").order("received_on", { ascending: false }).limit(200),
    sb.from("legal_rule").select("rule_id,topic,review_status,original_text_loaded").order("rule_id"),
    sb.from("legal_rule_history").select("id,rule_id,from_status,to_status,note,created_at").order("id", { ascending: false }).limit(20),
  ]);
  const updates = (up.data ?? []) as any[], rules = (rl.data ?? []) as { rule_id: string; topic: string; review_status: string; original_text_loaded: boolean }[];
  const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeZone: "Asia/Beirut" }).format(new Date(d));
  return (
    <><StaffHeader back="/staff/legal" backLabel="سجل القواعد" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <Intro title="ما الجديد في القانون؟">سجّل هنا أي تعميم أو قانون جديد وصلك، ليراجعه المسؤول القانوني. تسجيله لا يغيّر أي قاعدة تلقائيًا.</Intro>
      {sp.ok && <Notice>{OK[sp.ok] ?? "تم."}</Notice>}
      {sp.err && <Notice tone="bad">{ERR[sp.err] ?? ERR["1"]}</Notice>}
      {up.error && <Notice tone="bad">هذه الميزة لم تُفعَّل بعد. تواصل مع الدعم الفني لتفعيلها.</Notice>}

      {!up.error && (
        <StepCard n={1} title="سجّل خبرًا قانونيًا جديدًا" hint="اكتب من أين وصلك الخبر ومتى، ثم لخّصه بكلماتك.">
          <form action={addLegalUpdate} className="space-y-3">
            <Field label="من أين وصلك الخبر؟" example="الجريدة الرسمية، أو تعميم وزارة الداخلية" required><input name="source" required maxLength={500} className={field} /></Field>
            <Field label="متى وصلك؟" required><input type="date" name="received_on" required className={field} /></Field>
            <Field label="ما هو الخبر باختصار؟" hint="لخّصه بكلماتك. لا تلصق نصًا غير موثّق على أنه النص الرسمي." required><textarea name="summary" required rows={3} maxLength={5000} className="w-full rounded-xl border-2 bg-background p-3 text-base outline-none focus:border-primary" /></Field>
            <details className="rounded-xl bg-muted/50 px-3 py-2"><summary className="cursor-pointer font-semibold">حقول إضافية</summary>
              <div className="pt-3"><Field label="أي قواعد يمسّها هذا الخبر؟" hint="اختياري. اضغط مطوّلًا أو Ctrl لاختيار أكثر من واحدة."><select name="affected" multiple size={Math.min(6, Math.max(2, rules.length))} className="w-full rounded-xl border-2 bg-background p-2 text-base">{rules.map((r) => <option key={r.rule_id} value={r.rule_id}>{r.topic}</option>)}</select></Field></div></details>
            <button className={BTN_PRIMARY}>حفظ الخبر</button></form>
        </StepCard>)}

      <section className="space-y-3"><h2 className="text-lg font-bold">الأخبار المسجّلة ({updates.length})</h2>
        {updates.length === 0 && !up.error && <Empty>لا توجد أخبار مسجّلة بعد. سجّل أول خبر من النموذج أعلاه.</Empty>}
        <ul className="space-y-3">{updates.map((u) => (
          <li key={u.id} className="elev space-y-2 rounded-2xl border bg-background p-4 text-base">
            <p className="flex flex-wrap items-center gap-2"><Chip tone={(ST[u.status] ?? ["", "info"])[1] as any}>{(ST[u.status] ?? [u.status])[0]}</Chip><b>{u.source}</b><span className="text-sm text-muted-foreground">وصل {fmt(u.received_on)}</span></p>
            <p className="leading-7">{u.summary}</p>
            {u.affected_rules?.length > 0 && <p className="text-sm">القواعد المتأثرة: {u.affected_rules.map((r: string) => <Link key={r} href="/staff/legal" className="me-2 font-semibold text-primary underline">{r}</Link>)}</p>}
            {u.reviewer_note && <p className="text-sm text-muted-foreground">ملاحظة المراجع: {u.reviewer_note}{u.reviewed_at ? ` · ${fmt(u.reviewed_at)}` : ""}</p>}
            {isAdmin && (u.status === "received" || u.status === "under_review") && (
              <form action={reviewLegalUpdate} className="flex flex-wrap items-center gap-2 border-t pt-2"><input type="hidden" name="id" value={u.id} />
                <input name="note" maxLength={1000} placeholder="ملاحظتك (مطلوبة عند الموافقة أو الرفض)" aria-label="ملاحظة" className={`${field} min-w-52 flex-1`} />
                {u.status === "received" && <button name="status" value="under_review" className={BTN_SECONDARY}>أراجعه الآن</button>}
                <button name="status" value="approved" className={BTN_SECONDARY}>موافقة (تسجيل فقط)</button>
                <button name="status" value="rejected" className={BTN_SECONDARY}>رفض</button></form>)}
          </li>))}</ul></section>

      {isAdmin && rules.length > 0 && (
        <StepCard n={2} title="هل هذه القاعدة مؤكدة؟" hint="للمسؤول القانوني: اختر القاعدة ثم حالتها الجديدة. كل تغيير يُحفظ في السجل.">
          <form action={reviewRule} className="space-y-3">
            <Field label="أي قاعدة؟" required><select name="rule" required className={field}>{rules.map((r) => <option key={r.rule_id} value={r.rule_id}>{r.topic} — {(SURE[r.review_status] ?? SURE.pending_review)[0]}{r.original_text_loaded ? "" : " (النص الرسمي لم يُحمَّل)"}</option>)}</select></Field>
            <Field label="ما حالتها الآن؟"><select name="status" className={field}>{Object.entries(REVIEW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="لماذا؟ (السبب أو المرجع)" example="طابقتها مع الجريدة الرسمية العدد ..." required><input name="note" required maxLength={1000} className={field} /></Field>
            <Explain term="مراجَعة قانونيًا">لا يمكن اختيارها قبل تحميل النص الرسمي للقاعدة، حتى لا تُؤكَّد قاعدة دون مقابلتها بأصلها.</Explain>
            <button className={BTN_PRIMARY}>حفظ الحالة</button></form>
        </StepCard>)}

      {!hs.error && (hs.data ?? []).length > 0 && (
        <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer text-lg font-bold">من غيّر ماذا؟ (سجل المراجعات)</summary>
          <ul className="mt-3 divide-y text-base">{(hs.data ?? []).map((h: any) => <li key={h.id} className="py-2"><b>{rules.find((x) => x.rule_id === h.rule_id)?.topic ?? h.rule_id}</b>: {h.from_status ? REVIEW[h.from_status] : "—"} ← {REVIEW[h.to_status]} <span className="text-sm text-muted-foreground">· {fmt(h.created_at)} · {h.note}</span></li>)}</ul></details>)}
    </main></>
  );
}
