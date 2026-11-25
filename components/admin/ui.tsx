import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { DEADLINE_LABEL, ERR, safeRef, type DeadlineState, type Row } from "@/lib/admin";
import { addRef, deleteRef } from "@/app/staff/admin/actions";
import { Chip, Empty, Notice, StepCard } from "@/components/simple/kit";
import type { ReactNode } from "react";

export const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 text-base outline-none focus:border-primary";
export const area = "w-full rounded-xl border-2 bg-background p-3 outline-none focus:border-primary";
export const submit = "min-h-12 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground active:opacity-90";
export const small = "min-h-12 rounded-xl border-2 px-5 text-base font-semibold active:bg-muted";
export const lbl = "space-y-1 text-base font-semibold";
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

/** Mayor/admin only (the RPCs enforce it again server-side). */
export async function guard() {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  return { sb, today: today() };
}

/** Plain-language messages (display only): what went wrong AND what to do. Falls back to the library text. */
const PLAIN: Record<string, string> = {
  bad_input: "بعض المعلومات ناقصة أو غير صحيحة. راجعوا الحقول التي عليها علامة * وتواريخ الإدخال، ثم أعيدوا المحاولة.",
  forbidden: "هذا الإجراء لرئيس البلدية أو مدير النظام فقط.",
  not_found: "لم نجد هذا السجل. ربما حُذف؛ ارجعوا إلى القائمة وحدّثوا الصفحة.",
  not_closed: "لا يمكن أرشفة مراسلة لم يتم الرد عليها بعد. أنهوا الرد أولًا ثم أرشفوها.",
  basis_required: "كتبتم أنكم تحققتم من التصنيف، فاكتبوا أيضًا على أي مستند اعتمدتم (قرار أو قيد عقاري).",
  lawyer_required: "اكتبوا اسم المحامي الذي أعطى هذه المهلة. النظام لا يحسب المهل القانونية بنفسه.",
  evidence_required: "لإغلاق البند اكتبوا ما يُثبت المعالجة (الدليل) وتاريخ الإغلاق.",
  reply_date_required: "اكتبوا تاريخ الرد.",
  redaction_required: "لا يمكن النشر قبل إخفاء البيانات الشخصية أو السرية. أكملوا الإخفاء ثم فعّلوا «قابل للنشر».",
  bad_ref: "اكتبوا اسم المستند أو رقمه، أو رابطًا يبدأ بـ https.",
};

export function Shell({ title, sub, err, missing, hub, children }: { title: string; sub?: string; err?: string; missing?: boolean; hub?: boolean; children: React.ReactNode }) {
  const msg = err ? (PLAIN[err] ?? ERR[err] ?? "تعذّر تنفيذ العملية. حدّثوا الصفحة وأعيدوا المحاولة، وإن تكرر الأمر أخبروا مدير النظام.") : null;
  return (
    <><StaffHeader back={hub ? "/staff" : "/staff/admin"} backLabel={hub ? "الرئيسية" : "الإدارة البلدية"} />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">
      <div><h1 className="text-2xl font-extrabold leading-snug">{title}</h1>{sub && <p className="mt-1 text-base leading-7 text-muted-foreground">{sub}</p>}</div>
      {msg && (err === "pending" ? <Notice>{msg}</Notice> : <Notice tone="bad">{msg}</Notice>)}
      {missing ? <Pending /> : children}
    </main></>
  );
}

export function Pending() {
  return <Notice>هذه الخدمة غير مفعّلة بعد في النظام. لا حاجة لأي إجراء منكم: يُفعّلها مدير النظام، ولا يضيع شيء.</Notice>;
}

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "warn" | "bad" | "ok" }) {
  return <Chip tone={({ plain: "info", warn: "wait", bad: "bad", ok: "ok" } as const)[tone]}>{children}</Chip>;
}
export function DeadlineBadge({ state, due }: { state: DeadlineState; due?: string | null }) {
  if (!state) return null;
  return <Badge tone={state === "overdue" ? "bad" : state === "soon" ? "warn" : "plain"}>{DEADLINE_LABEL[state]}{due ? ` · ${due}` : ""}</Badge>;
}

export function Chips({ items }: { items: { href: string; on: boolean; label: string }[] }) {
  return <div className="flex flex-wrap gap-2">{items.map((c) => <Link key={c.href} href={c.href} className={`min-h-11 rounded-full border-2 px-4 py-2 text-base ${c.on ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{c.label}</Link>)}</div>;
}

/** References block: text or http(s) URL only (no file storage). */
export function Refs({ refs, entity, id, back }: { refs: Row[]; entity: string; id: string; back: string }) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <b className="text-base">المستندات المرتبطة <span className="text-sm font-normal text-muted-foreground">(اكتبوا اسم المستند ورقمه أو رابطه)</span></b>
      {refs.length === 0 ? <p className="text-xs text-muted-foreground">لا مستندات مرتبطة بعد.</p> : (
        <ul className="space-y-1.5 text-sm">{refs.map((r) => { const { href, text } = safeRef(r.ref); return (
          <li key={r.id} className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.title}:</span>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{text}</a> : <span className="break-all">{text}</span>}
            <form action={deleteRef}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><button className="text-xs text-destructive underline">حذف</button></form></li>); })}</ul>)}
      <form action={addRef} className="grid gap-2 sm:grid-cols-5">
        <input type="hidden" name="entity" value={entity} /><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="back" value={back} />
        <input name="title" required maxLength={300} placeholder="اسم المستند (مثال: كتاب وزارة الداخلية)" aria-label="عنوان المستند" className={`${field} sm:col-span-2`} />
        <input name="ref" required maxLength={1000} placeholder="رقم الكتاب أو رابطه" aria-label="المرجع" className={`${field} sm:col-span-2`} />
        <button className={small}>أضف المستند</button>
      </form>
    </div>
  );
}

/** A big "＋ …" button that opens a guided form: use for every "add new" form. */
export function AddNew({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <details className="elev rounded-3xl border-2 border-primary/30 bg-background p-4">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 text-lg font-extrabold text-primary"><span aria-hidden className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">＋</span>{title}</summary>
      <p className="mt-2 text-base leading-7 text-muted-foreground">{intro}</p>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  );
}

/** Optional fields, collapsed under one clear heading (nothing removed). */
export function MoreFields({ children, label = "حقول إضافية (اختيارية)" }: { children: ReactNode; label?: string }) {
  return (
    <details className="rounded-2xl border bg-muted/30 p-3"><summary className="min-h-10 cursor-pointer text-base font-semibold">{label}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div></details>
  );
}

export const FormGrid = "grid gap-3 sm:grid-cols-2";
export { Empty, StepCard, Chip };
