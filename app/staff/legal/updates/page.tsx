import Link from "next/link";
import { redirect } from "next/navigation";
import StaffHeader from "@/components/StaffHeader";
import { requireStaff } from "@/lib/supabase-server";
import { REVIEW } from "@/components/legal/LegalPanel";
import { addLegalUpdate, reviewLegalUpdate, reviewRule } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "مستجدات التشريع — BALADI ONE", referrer: "no-referrer" as const };
const ST: Record<string, string> = { received: "مستلم", under_review: "قيد المراجعة", approved: "موافَق عليه", rejected: "مرفوض" };
const ERR: Record<string, string> = { forbidden: "هذا الإجراء للمدير (المراجع القانوني) فقط.", note_required: "الملاحظة مطلوبة.", unknown_rule: "قاعدة غير موجودة في السجل.", already_decided: "تم البت في هذا المستجد.", original_text_required: "لا يمكن اعتماد قاعدة «مراجَعة» قبل تحميل نصها الأصلي.", no_change: "الحالة نفسها، لا تغيير.", unavailable: "قيد التفعيل: ترحيل المستجدات (0026) لم يُطبَّق بعد.", "1": "تحقق من الحقول ثم أعد المحاولة." };
const OK: Record<string, string> = { added: "سُجّل المستجد.", reviewed: "سُجّل القرار على المستجد. لم تتغير أي قاعدة.", rule: "سُجّلت مراجعة القاعدة في سجل التاريخ." };
const field = "min-h-11 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

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
      <h1 className="text-2xl font-bold">مستجدات التشريع ومراجعة القواعد</h1>
      <p className="rounded-2xl border border-amber-400/60 bg-amber-50 p-3 text-sm leading-7 text-amber-950">الموافقة على مستجد تُسجِّل قرار المراجعة فقط ولا تعدّل أي قاعدة تلقائيًا. تعديل القاعدة يتم بترحيل مراجَع، وتغيير حالة مراجعتها يتم من المدير بنموذج «مراجعة قاعدة» أدناه مع حفظ سجل.</p>
      {sp.ok && <p role="status" className="rounded-xl border border-green-600/40 p-3 text-sm">{OK[sp.ok] ?? "تم."}</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{ERR[sp.err] ?? ERR["1"]}</p>}
      {up.error && <p role="status" className="rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950">قيد التفعيل: جدول المستجدات غير متاح بعد (الترحيل 0026 لم يُطبَّق).</p>}

      {!up.error && (
        <section className="elev space-y-3 rounded-2xl border bg-background p-4"><h2 className="font-bold">تسجيل مستجد</h2>
          <form action={addLegalUpdate} className="grid gap-2 sm:grid-cols-2">
            <input name="source" required maxLength={500} placeholder="المصدر (جريدة رسمية، تعميم، قانون…)" aria-label="المصدر" className={field} />
            <input type="date" name="received_on" required aria-label="تاريخ الاستلام" className={field} />
            <textarea name="summary" required rows={3} maxLength={5000} placeholder="ملخص المستجد (لا تلصق نصًا غير موثَّق كأنه النص الرسمي)" aria-label="الملخص" className="rounded-xl border-2 bg-background p-3 outline-none focus:border-primary sm:col-span-2" />
            <label className="space-y-1 text-sm font-medium sm:col-span-2">القواعد المتأثرة (اختياري)
              <select name="affected" multiple size={Math.min(6, Math.max(2, rules.length))} className="w-full rounded-xl border-2 bg-background p-2">{rules.map((r) => <option key={r.rule_id} value={r.rule_id}>{r.rule_id} — {r.topic}</option>)}</select></label>
            <button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground sm:col-span-2">تسجيل</button></form>
        </section>)}

      <section className="space-y-3"><h2 className="font-bold">المستجدات ({updates.length})</h2>
        {updates.length === 0 && !up.error && <p className="text-sm text-muted-foreground">لا مستجدات مسجّلة.</p>}
        <ul className="space-y-3">{updates.map((u) => (
          <li key={u.id} className="elev space-y-2 rounded-2xl border bg-background p-4 text-sm">
            <p className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-accent px-3 py-0.5 text-xs font-bold text-primary">{ST[u.status]}</span><b>{u.source}</b><span className="text-xs text-muted-foreground">استُلم {fmt(u.received_on)}</span></p>
            <p className="leading-7">{u.summary}</p>
            {u.affected_rules?.length > 0 && <p className="text-xs">القواعد المتأثرة: {u.affected_rules.map((r: string) => <Link key={r} href="/staff/legal" className="me-2 font-semibold text-primary underline">{r}</Link>)}</p>}
            {u.reviewer_note && <p className="text-xs text-muted-foreground">ملاحظة المراجع: {u.reviewer_note}{u.reviewed_at ? ` · ${fmt(u.reviewed_at)}` : ""}</p>}
            {isAdmin && (u.status === "received" || u.status === "under_review") && (
              <form action={reviewLegalUpdate} className="flex flex-wrap items-center gap-2 border-t pt-2"><input type="hidden" name="id" value={u.id} />
                <input name="note" maxLength={1000} placeholder="ملاحظة المراجع (مطلوبة عند الموافقة/الرفض)" aria-label="ملاحظة" className={`${field} min-w-52 flex-1`} />
                {u.status === "received" && <button name="status" value="under_review" className="min-h-11 rounded-xl border px-3 text-sm active:bg-muted">قيد المراجعة</button>}
                <button name="status" value="approved" className="min-h-11 rounded-xl border px-3 text-sm active:bg-muted">موافقة (تسجيل فقط)</button>
                <button name="status" value="rejected" className="min-h-11 rounded-xl border px-3 text-sm active:bg-muted">رفض</button></form>)}
          </li>))}</ul></section>

      {isAdmin && rules.length > 0 && (
        <section className="elev space-y-3 rounded-2xl border bg-background p-4"><h2 className="font-bold">مراجعة قاعدة (المراجع القانوني)</h2>
          <p className="text-xs text-muted-foreground">يُسجَّل كل تغيير حالة في سجل تاريخ القاعدة. لا يمكن وسم قاعدة «مراجَعة» قبل تحميل نصها الأصلي.</p>
          <form action={reviewRule} className="grid gap-2 sm:grid-cols-3">
            <select name="rule" required aria-label="القاعدة" className={field}>{rules.map((r) => <option key={r.rule_id} value={r.rule_id}>{r.rule_id} — {REVIEW[r.review_status]}{r.original_text_loaded ? "" : " (النص غير محمَّل)"}</option>)}</select>
            <select name="status" aria-label="الحالة الجديدة" className={field}>{Object.entries(REVIEW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="note" required maxLength={1000} placeholder="سبب/مرجع المراجعة" aria-label="الملاحظة" className={field} />
            <button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground sm:col-span-3">تسجيل المراجعة</button></form>
        </section>)}

      {!hs.error && (hs.data ?? []).length > 0 && (
        <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold">سجل مراجعات القواعد</summary>
          <ul className="mt-3 divide-y text-sm">{(hs.data ?? []).map((h: any) => <li key={h.id} className="py-2"><b>{h.rule_id}</b>: {h.from_status ? REVIEW[h.from_status] : "—"} ← {REVIEW[h.to_status]} <span className="text-xs text-muted-foreground">· {fmt(h.created_at)} · {h.note}</span></li>)}</ul></details>)}
    </main></>
  );
}
