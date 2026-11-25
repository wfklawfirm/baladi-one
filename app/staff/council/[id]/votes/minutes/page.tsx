import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { uuidOk } from "@/lib/council";
import { approveMinutes, attachSignedMinutes, correctMinutes, saveMinutes, setMinutesConfidential } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "محضر الجلسة — BALADI ONE", referrer: "no-referrer" as const };
const ST: Record<string, string> = { draft: "مسودة", approved: "معتمد", signed: "نسخة موقّعة مسجَّلة" };
const ERR: Record<string, string> = { minutes_locked: "المحضر المعتمد لا يُعدَّل مباشرة: استخدم سجل التصحيحات.", minutes_not_approved: "اعتمد المحضر أولًا.", minutes_still_draft: "المحضر ما زال مسودة: عدّله مباشرة.", unavailable: "قيد التفعيل: ترحيل المحاضر (0026) لم يُطبَّق بعد.", session_locked: "الجلسة ملغاة.", "1": "تحقق من الحقول ثم أعد المحاولة." };
const OK: Record<string, string> = { saved: "حُفظت نسخة جديدة من المسودة.", approved: "سُجِّل اعتماد المحضر.", signed: "سُجِّل مرجع النسخة الموقّعة.", corrected: "أُضيف التصحيح إلى السجل.", conf: "تم تحديث السرّية." };
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));
const field = "min-h-11 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

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
      <div><h1 className="text-2xl font-bold">محضر الجلسة — {s.title}{s.session_no ? ` (${s.session_no})` : ""}</h1>
        <p className="flex flex-wrap gap-2 pt-1 text-xs"><span className="rounded-full bg-accent px-3 py-1 font-bold text-primary">{head ? ST[head.status] : "لا محضر بعد"}</span>{head?.confidential && <span className="rounded-full bg-destructive/10 px-3 py-1 font-bold text-destructive">سرّي</span>}{head && <span className="text-muted-foreground">النسخة الحالية {head.current_version}{head.approved_version ? ` · المعتمدة ${head.approved_version}` : ""}</span>}</p></div>
      {sp.ok && <p role="status" className="rounded-xl border border-green-600/40 p-3 text-sm">{OK[sp.ok] ?? "تم."}</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{ERR[sp.err] ?? ERR["1"]}</p>}
      {unavailable && <p role="status" className="rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950">قيد التفعيل: جداول المحاضر غير متاحة بعد (الترحيل 0026 لم يُطبَّق). يبقى حقل «المحضر» القديم في صفحة الجلسة هو المعتمد حاليًا.</p>}

      {!unavailable && draft && (
        <section className="elev space-y-3 rounded-2xl border bg-background p-4"><h2 className="font-bold">المسودة</h2>
          <p className="text-xs text-muted-foreground">كل حفظ ينشئ نسخة جديدة محفوظة في السجل. اعتماد المحضر قرار بشري يُسجَّل هنا؛ بعده لا يُعدَّل النص إلا عبر التصحيحات.</p>
          <form action={saveMinutes} className="space-y-2"><input type="hidden" name="session" value={id} />
            <textarea name="body" required defaultValue={latest?.body ?? s.minutes_text ?? ""} rows={14} maxLength={60000} aria-label="نص المحضر" className="w-full rounded-xl border-2 bg-background p-3 leading-7 outline-none focus:border-primary" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confidential" defaultChecked={head?.confidential ?? false} className="size-5" />محضر سرّي (لا يراه إلا الرئيس والمدير)</label>
            <button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ نسخة جديدة</button></form>
          {head && head.current_version >= 1 && <form action={approveMinutes}><input type="hidden" name="session" value={id} /><button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground active:opacity-90">اعتماد النسخة {head.current_version}</button></form>}
        </section>)}

      {head && !draft && (
        <section className="elev space-y-3 rounded-2xl border bg-background p-4"><h2 className="font-bold">النص المعتمد (النسخة {head.approved_version})</h2>
          <p className="text-xs text-muted-foreground">اعتُمد {head.approved_at ? fmt(head.approved_at) : ""}. لا تعديل مباشر؛ التصحيحات أدناه سجل إضافي لا يُحذف.</p>
          <pre className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm leading-7">{approved?.body ?? "—"}</pre>
          <div className="flex flex-wrap items-center gap-2"><form action={setMinutesConfidential}><input type="hidden" name="session" value={id} /><input type="hidden" name="flag" value={head.confidential ? "0" : "1"} /><button className="min-h-11 rounded-xl border px-4 text-sm active:bg-muted">{head.confidential ? "إلغاء السرّية" : "وسم سرّي"}</button></form></div>
        </section>)}

      {head?.status === "approved" && (
        <section className="elev space-y-2 rounded-2xl border bg-background p-4"><h2 className="font-bold">مرجع النسخة الموقّعة</h2>
          <p className="text-xs text-muted-foreground">التوقيع يتم خارج النظام. سجّل رقم الأرشفة أو الرابط الذي يشير إلى النسخة الموقّعة؛ لا يُرفع ملف هنا ولا يمكن تغيير المرجع لاحقًا.</p>
          <form action={attachSignedMinutes} className="flex flex-wrap gap-2"><input type="hidden" name="session" value={id} /><input name="ref" required maxLength={500} placeholder="رقم الأرشفة / الرابط" aria-label="مرجع النسخة الموقّعة" className={`${field} min-w-60 flex-1`} /><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold active:bg-muted">تسجيل المرجع</button></form>
        </section>)}
      {head?.status === "signed" && <p className="rounded-xl border p-3 text-sm">النسخة الموقّعة: <b>{head.signed_copy_ref}</b></p>}

      {head && !draft && (
        <section className="elev space-y-3 rounded-2xl border bg-background p-4"><h2 className="font-bold">سجل التصحيحات ({(cs?.data ?? []).length})</h2>
          <ol className="space-y-2 text-sm">{(cs?.data ?? []).map((c: any) => (
            <li key={c.id} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">#{c.seq} · على النسخة {c.version_ref} · {fmt(c.entered_at)}{c.section_ref ? ` · ${c.section_ref}` : ""}</p>
              {c.original_text && <p className="line-through opacity-70">{c.original_text}</p>}<p>{c.corrected_text}</p><p className="text-xs">السبب: {c.reason}{c.authority_ref ? ` · المرجع: ${c.authority_ref}` : ""}</p></li>))}</ol>
          <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold text-primary">إضافة تصحيح</summary>
            <form action={correctMinutes} className="mt-3 grid gap-2"><input type="hidden" name="session" value={id} />
              <input name="section" maxLength={300} placeholder="الموضع في المحضر (اختياري)" aria-label="الموضع" className={field} />
              <textarea name="original" rows={2} maxLength={5000} placeholder="النص الأصلي المصحَّح (اختياري)" aria-label="النص الأصلي" className="rounded-xl border-2 bg-background p-3 outline-none focus:border-primary" />
              <textarea name="corrected" required rows={3} maxLength={5000} placeholder="النص بعد التصحيح" aria-label="النص المصحَّح" className="rounded-xl border-2 bg-background p-3 outline-none focus:border-primary" />
              <input name="reason" required maxLength={1000} placeholder="سبب التصحيح" aria-label="السبب" className={field} />
              <input name="authority" maxLength={500} placeholder="مرجع إقرار التصحيح (جلسة/قرار المجلس) — يلزم تحقق من الإجراء القانوني" aria-label="المرجع" className={field} />
              <button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground active:opacity-90">إضافة إلى السجل</button></form></details>
        </section>)}

      {versions.length > 0 && (
        <details className="elev rounded-2xl border bg-background p-4"><summary className="cursor-pointer font-bold">سجل النسخ ({versions.length})</summary>
          <ul className="mt-3 space-y-2 text-sm">{versions.map((v) => <li key={v.version} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">النسخة {v.version} · {fmt(v.saved_at)}{v.version === head?.approved_version ? " · المعتمدة" : ""}</p><p className="line-clamp-3 whitespace-pre-wrap">{v.body}</p></li>)}</ul></details>)}
      <Link href={`/staff/council/${id}`} className="text-sm font-semibold text-primary">← صفحة الجلسة</Link>
    </main></>
  );
}
