import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { uuidOk } from "@/lib/council";
import { loadTemplate, loadTemplates } from "@/lib/decisions/load";
import { ISSUER_LABEL, STATUS_LABEL, type TemplateContent } from "@/lib/decisions/model";
import { reviewTemplate, saveTemplate } from "../../actions";
import { errText } from "@/lib/decisions/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "قالب قرار — BALADI ONE", referrer: "no-referrer" as const };
const inp = "min-h-11 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";
const ft = (d: string | null) => (d ? new Intl.DateTimeFormat("ar-LB", { dateStyle: "medium", timeZone: "Asia/Beirut" }).format(new Date(d)) : "—");

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; saved?: string; reviewed?: string }> }) {
  const { id } = await params; if (!uuidOk(id)) notFound();
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "admin" || m.role === "mayor")) redirect("/staff");
  const isAdmin = memberships.some((m) => m.role === "admin");
  const sp = await searchParams;
  const t = await loadTemplate(sb, id);
  if (!t) notFound();
  const content = (t as unknown as { content: TemplateContent }).content;
  const { rows } = await loadTemplates(sb);
  const sibs = rows.filter((r) => r.template_id === t.template_id).sort((a, b) => b.seq - a.seq);
  const editable = t.status === "draft" && isAdmin;
  const json = JSON.stringify(content, null, 2);
  return (
    <>
      <StaffHeader back="/staff/decisions/templates" backLabel="القوالب" />
      <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{t.title_ar}</h1><span dir="ltr" className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">{t.template_id} · v{t.version}</span><span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary">{STATUS_LABEL[t.status]}</span></div>
        <p className="text-sm text-muted-foreground">{ISSUER_LABEL[t.issuer]} · {t.category_ar} · سريان: {ft(t.effective_from)} · اعتماد: {ft(t.approved_at)}{t.review_note ? ` · ملاحظة المراجعة: ${t.review_note}` : ""}</p>
        {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{sp.err === "json" ? "صيغة JSON غير صالحة." : errText({ message: sp.err })}</p>}
        {(sp.saved || sp.reviewed) && <p role="status" className="rounded-xl border p-3 text-sm">تم.</p>}

        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">المراجعة القانونية</h2>
          <p className="text-xs text-muted-foreground">لا يُعتمد القالب إلا بعد مطابقة مراجعه القانونية مع النصوص الرسمية النافذة وقواعد السجل. الاعتماد يتطلب شخصًا غير مُقدِّم القالب.</p>
          <form action={reviewTemplate} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={t.id} />
            <label className="min-w-0 flex-1 text-sm">ملاحظة المراجعة<input name="note" className={`${inp} mt-1`} /></label>
            <label className="text-sm">تاريخ السريان<input type="date" name="effective" className={`${inp} mt-1`} /></label>
            {t.status === "draft" && isAdmin && <button name="to" value="pending_legal_review" className="min-h-11 rounded-xl border px-4 text-sm font-semibold">إرسال للمراجعة القانونية</button>}
            {t.status === "pending_legal_review" && <><button name="to" value="approved" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">اعتماد</button>{isAdmin && <button name="to" value="draft" className="min-h-11 rounded-xl border px-4 text-sm font-semibold">إعادة لمسودة</button>}</>}
            {isAdmin && t.status !== "archived" && t.status !== "pending_legal_review" && <button name="to" value="archived" className="min-h-11 rounded-xl border px-4 text-sm">أرشفة</button>}
          </form></section>

        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">الإصدارات</h2>
          <ul className="space-y-1 text-sm">{sibs.map((s) => <li key={s.id}><Link href={`/staff/decisions/templates/${s.id}`} className={`underline ${s.id === t.id ? "font-bold" : ""}`}>إصدار {s.version}</Link> — {STATUS_LABEL[s.status]} — سريان {ft(s.effective_from)}</li>)}</ul>
          {isAdmin && <form action={saveTemplate} className="flex flex-wrap items-end gap-2 border-t pt-2"><input type="hidden" name="template_id" value={t.template_id} /><input type="hidden" name="content" value={json} />
            <label className="text-sm">رقم الإصدار الجديد<input name="version" required className={`${inp} mt-1`} dir="ltr" /></label><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold">نسخة جديدة (مسودة) من هذا القالب</button></form>}</section>

        <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">محتوى القالب</h2>
          {editable ? <form action={saveTemplate} className="space-y-2"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="template_id" value={t.template_id} /><input type="hidden" name="version" value={t.version} />
            <textarea name="content" defaultValue={json} rows={28} dir="ltr" spellCheck={false} className="w-full rounded-xl border-2 p-3 font-mono text-xs" />
            <button className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">حفظ المسودة</button></form>
            : <><p className="text-xs text-muted-foreground">للقراءة فقط: لا يُعدَّل إلا قالب في حالة «مسودة». لتعديل قالب معتمد أنشئ نسخة جديدة.</p><pre dir="ltr" className="max-h-[32rem] overflow-auto rounded-xl border bg-muted/30 p-3 text-xs">{json}</pre></>}</section>
      </main>
    </>
  );
}
