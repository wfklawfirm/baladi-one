import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { DEADLINE_LABEL, ERR, safeRef, type DeadlineState, type Row } from "@/lib/admin";
import { addRef, deleteRef } from "@/app/staff/admin/actions";

export const field = "min-h-12 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
export const area = "w-full rounded-xl border-2 bg-background p-3 outline-none focus:border-primary";
export const submit = "min-h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground active:opacity-90";
export const small = "min-h-10 rounded-xl border px-4 text-sm font-semibold active:bg-muted";
export const lbl = "space-y-1 text-sm font-medium";
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());

/** Mayor/admin only (the RPCs enforce it again server-side). */
export async function guard() {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "mayor" || m.role === "admin")) redirect("/staff");
  return { sb, today: today() };
}

export function Shell({ title, sub, err, missing, hub, children }: { title: string; sub?: string; err?: string; missing?: boolean; hub?: boolean; children: React.ReactNode }) {
  const msg = err ? (ERR[err] ?? ERR["1"]) : null;
  return (
    <><StaffHeader back={hub ? "/staff" : "/staff/admin"} backLabel={hub ? "الرئيسية" : "الإدارة البلدية"} />
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">
      <div><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}</div>
      {msg && <p role="alert" className={`rounded-xl border p-3 text-sm ${err === "pending" ? "border-primary/40 bg-accent text-primary" : "border-destructive/40"}`}>{msg}</p>}
      {missing ? <Pending /> : children}
    </main></>
  );
}

export function Pending() {
  return <p role="status" className="rounded-2xl border border-primary/30 bg-accent p-6 text-center text-sm font-semibold text-primary">قيد التفعيل — هذه الوحدة تنتظر تطبيق ترحيل قاعدة البيانات (0025). لا بيانات لعرضها بعد.</p>;
}

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "warn" | "bad" | "ok" }) {
  const c = { plain: "bg-muted", warn: "bg-accent text-primary", bad: "bg-destructive/10 text-destructive", ok: "bg-accent text-primary" }[tone];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{children}</span>;
}
export function DeadlineBadge({ state, due }: { state: DeadlineState; due?: string | null }) {
  if (!state) return null;
  return <Badge tone={state === "overdue" ? "bad" : state === "soon" ? "warn" : "plain"}>{DEADLINE_LABEL[state]}{due ? ` · ${due}` : ""}</Badge>;
}

export function Chips({ items }: { items: { href: string; on: boolean; label: string }[] }) {
  return <div className="flex flex-wrap gap-2">{items.map((c) => <Link key={c.href} href={c.href} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${c.on ? "bg-primary text-primary-foreground" : "bg-background active:bg-muted"}`}>{c.label}</Link>)}</div>;
}

/** References block: text or http(s) URL only (no file storage). */
export function Refs({ refs, entity, id, back }: { refs: Row[]; entity: string; id: string; back: string }) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <b className="text-sm">المستندات (مراجع نصية أو روابط)</b>
      {refs.length === 0 ? <p className="text-xs text-muted-foreground">لا مراجع مسجّلة.</p> : (
        <ul className="space-y-1.5 text-sm">{refs.map((r) => { const { href, text } = safeRef(r.ref); return (
          <li key={r.id} className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.title}:</span>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{text}</a> : <span className="break-all">{text}</span>}
            <form action={deleteRef}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><button className="text-xs text-destructive underline">حذف</button></form></li>); })}</ul>)}
      <form action={addRef} className="grid gap-2 sm:grid-cols-5">
        <input type="hidden" name="entity" value={entity} /><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="back" value={back} />
        <input name="title" required maxLength={300} placeholder="عنوان المستند" aria-label="عنوان المستند" className={`${field} sm:col-span-2`} />
        <input name="ref" required maxLength={1000} placeholder="رقم الملف أو رابط https" aria-label="المرجع" className={`${field} sm:col-span-2`} />
        <button className={small}>إضافة</button>
      </form>
    </div>
  );
}
