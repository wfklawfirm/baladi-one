import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { loadSources, loadTemplates } from "@/lib/decisions/load";
import { seedPayload } from "@/lib/decisions/seed";
import { ISSUER_LABEL, STATUS_LABEL, type TplStatus } from "@/lib/decisions/model";
import { importSeed, setLegalProfile, setSourceDate } from "../actions";
import { errText } from "@/lib/decisions/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "إدارة قوالب القرارات — BALADI ONE", referrer: "no-referrer" as const };
const inp = "min-h-11 w-full rounded-xl border-2 bg-background px-3 outline-none focus:border-primary";

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; err?: string; imported?: string; profile?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "admin" || m.role === "mayor")) redirect("/staff");
  const isAdmin = memberships.some((m) => m.role === "admin");
  const sp = await searchParams;
  const [{ rows }, sources, muni] = await Promise.all([loadTemplates(sb), loadSources(sb), sb.from("municipality").select("governorate_ar,district_ar,legal_profile_verified_on,legal_profile_note").limit(1).maybeSingle()]);
  const seed = seedPayload();
  const needle = (sp.q ?? "").trim().toLowerCase();
  const list = rows.filter((r) => (!sp.s || r.status === sp.s) && (!needle || r.title_ar.toLowerCase().includes(needle) || r.template_id.toLowerCase().includes(needle)));
  const counts = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  const known = new Set(rows.map((r) => r.template_id));
  const toImport = seed.items.filter((i) => !known.has(i.id)).length;
  return (
    <>
      <StaffHeader back="/staff/decisions" backLabel="المنشئ" />
      <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
        <h1 className="text-2xl font-bold">إدارة قوالب القرارات</h1>
        <p className="text-sm text-muted-foreground">دورة الحياة: مسودة ← بانتظار المراجعة القانونية ← معتمد ← مستبدل/مؤرشف. يعتمد القالب شخص غير الذي قدّمه، بتاريخ سريان وملاحظة مراجعة. كل قرار يحتفظ بنسخة القالب التي أُنشئ بها.</p>
        {sp.err && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{errText({ message: sp.err })}</p>}
        {sp.imported && <p role="status" className="rounded-xl border p-3 text-sm">استُورد {sp.imported} قالبًا بحالة «بانتظار المراجعة القانونية». لم يُعتمد أي منها.</p>}
        {sp.profile && <p role="status" className="rounded-xl border p-3 text-sm">حُفظ البيان القانوني للبلدية.</p>}

        {isAdmin && <section className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">استيراد المكتبة التأسيسية</h2>
          <p className="text-sm text-muted-foreground">الملف المرفق ({seed.total} قالبًا، بتاريخ {seed.asOf}) مسودات تأسيسية وليست نصوصًا رسمية. {toImport > 0 ? `${toImport} قالبًا لم يُستورد بعد.` : "كل القوالب مستوردة."} الاستيراد مكرَّر الأمان (لا يكتب فوق قالب موجود) ويُسجَّل في سجل التدقيق.</p>
          {toImport > 0 && <form action={importSeed}><button className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">استيراد {toImport} قالبًا</button></form>}</section>}

        <section className="grid gap-4 md:grid-cols-2">
          {isAdmin && <form action={setLegalProfile} className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">البيان القانوني للبلدية (الترويس)</h2>
            <label className="block text-sm">المحافظة<input name="governorate" defaultValue={muni.data?.governorate_ar ?? ""} className={`${inp} mt-1`} /></label>
            <label className="block text-sm">القضاء<input name="district" defaultValue={muni.data?.district_ar ?? ""} className={`${inp} mt-1`} /></label>
            <label className="block text-sm">ملاحظة<input name="note" defaultValue={muni.data?.legal_profile_note ?? ""} className={`${inp} mt-1`} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={!!muni.data?.legal_profile_verified_on} className="size-5" />تحققتُ من هذه البيانات رسميًا</label>
            <button className="min-h-10 rounded-xl border px-4 text-sm font-semibold active:bg-muted">حفظ</button></form>}
          <div className="space-y-2 rounded-2xl border p-4"><h2 className="font-bold">المصادر ({sources.length})</h2>
            <p className="text-xs text-muted-foreground">تاريخ السريان للمصدر يُدخله المراجع القانوني؛ لا يُفترض.</p>
            <ul className="max-h-72 space-y-1 overflow-auto text-sm">{sources.map((s) => <li key={s.source_id} className="flex flex-wrap items-center gap-2 border-b py-1"><b dir="ltr" className="text-xs">{s.source_id}</b><span className="min-w-0 flex-1">{s.title}</span>
              {isAdmin ? <form action={setSourceDate} className="flex items-center gap-1"><input type="hidden" name="source" value={s.source_id} /><input type="date" name="effective" defaultValue={s.effective_from ?? ""} aria-label="سريان" className="min-h-9 rounded-lg border px-1 text-xs" /><button className="min-h-9 rounded-lg border px-2 text-xs">حفظ</button></form> : <span className="text-xs">{s.effective_from ?? "—"}</span>}</li>)}</ul></div>
        </section>

        <div className="flex flex-wrap gap-2 text-sm">{(["", "pending_legal_review", "approved", "draft", "superseded", "archived"] as const).map((s) => <Link key={s} href={s ? `/staff/decisions/templates?s=${s}` : "/staff/decisions/templates"} className={`min-h-10 rounded-full border px-3.5 py-2 ${(sp.s ?? "") === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{s ? STATUS_LABEL[s as TplStatus] : "الكل"} ({s ? counts[s] ?? 0 : rows.length})</Link>)}</div>
        <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="بحث" aria-label="بحث" className={inp} />{sp.s && <input type="hidden" name="s" value={sp.s} />}<button className="min-h-11 rounded-xl border px-4 text-sm font-semibold">بحث</button></form>
        {list.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">لا قوالب.</p> : (
          <ul className="divide-y rounded-xl border bg-background">{list.map((r) => <li key={r.id}><Link href={`/staff/decisions/templates/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted"><b dir="ltr" className="text-primary">{r.template_id}</b><span className="font-medium">{r.title_ar}</span><span className="text-xs text-muted-foreground">{ISSUER_LABEL[r.issuer]} · إصدار {r.version}</span><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">{STATUS_LABEL[r.status]}</span></Link></li>)}</ul>)}
      </main>
    </>
  );
}
