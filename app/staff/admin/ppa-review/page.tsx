import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import StaffHeader from "@/components/StaffHeader";
import { reviewDoc } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "مراجعة نصوص هيئة الشراء العام — BALADI ONE", referrer: "no-referrer" as const, robots: { index: false } };
const ST: Record<string, string> = { pending_review: "قيد المراجعة", verified: "معتمد من المالك", rejected: "مرفوض", superseded: "منسوخ" };
const Q: Record<string, string> = { text: "نص", ocr: "OCR (الأرقام غير موثوقة)", "ocr+text": "نص + OCR" };

export default async function PpaReview({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; msg?: string }> }) {
  const sp = await searchParams;
  const { sb } = await requireStaff();
  const { data: owner } = await sb.rpc("is_platform_owner");
  if (owner !== true) redirect("/staff");
  let query = sb.from("procurement_doc").select("page_id,title,category,text_quality,source_url,file_urls,verification_status,review_note,reviewed_at").order("page_id").limit(60);
  const s = sp.s && ST[sp.s] ? sp.s : "", q = (sp.q ?? "").trim().slice(0, 60).replace(/[%,()]/g, " ");
  if (s) query = query.eq("verification_status", s);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data: docs } = await query;
  const back = `/staff/admin/ppa-review${s || q ? `?${new URLSearchParams({ ...(s ? { s } : {}), ...(q ? { q } : {}) })}` : ""}`;
  return (
    <><StaffHeader back="/staff/admin" backLabel="الإدارة" />
    <main dir="rtl" lang="ar" className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">مراجعة نصوص هيئة الشراء العام</h1>
      <p className="text-sm leading-6 text-muted-foreground">لكل مستند: افتح الأصل وقارنه بالنص المخزّن ثم حدّد الحالة. «معتمد من المالك» يعني مراجعة بشرية قمتَ بها أنت، وليس توثيقًا قانونيًا شاملًا. يُلغى الاعتماد تلقائيًا إن تغيّر النص عند إعادة الاستيراد. «مرفوض» و«منسوخ» لا يستعملهما المساعد.</p>
      {sp.msg && <p role="status" className="rounded-xl bg-accent p-3 text-sm text-primary">{sp.msg}</p>}
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="ابحث في العنوان" className="min-h-11 flex-1 rounded-lg border px-3 text-sm" />
        <select name="s" defaultValue={s} className="min-h-11 rounded-lg border px-2 text-sm"><option value="">كل الحالات</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="min-h-11 rounded-lg border px-4 font-bold">تصفية</button>
      </form>
      <ul className="space-y-3">{(docs ?? []).map((d: any) => (
        <li key={d.page_id} className="space-y-2 rounded-xl border p-3 text-sm">
          <p className="font-bold">{d.title}</p>
          <p className="text-muted-foreground">{d.category} · {d.text_quality ? Q[d.text_quality] : "بلا نص مقروء"} · الحالة: <b>{ST[d.verification_status]}</b>{d.review_note ? ` · «${d.review_note}»` : ""}</p>
          <p className="flex flex-wrap gap-3"><a className="underline" href={d.source_url} target="_blank" rel="noopener noreferrer">صفحة الموقع</a>{(d.file_urls ?? []).slice(0, 1).map((u: string) => <a key={u} className="underline" href={u} target="_blank" rel="noopener noreferrer">ملف الأصل</a>)}</p>
          <form action={reviewDoc} className="space-y-2">
            <input type="hidden" name="page_id" value={d.page_id} /><input type="hidden" name="back" value={back} />
            <select name="status" defaultValue={d.verification_status} className="min-h-11 w-full rounded-lg border px-2">{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="note" placeholder="ملاحظة المراجعة (إلزامية للاعتماد/الرفض/النسخ)" className="min-h-11 w-full rounded-lg border px-3" />
            <label className="flex items-center gap-2"><input type="checkbox" name="compared" value="yes" className="size-5" /> قارنتُ النص بالأصل</label>
            <button className="min-h-11 w-full rounded-xl bg-primary px-4 font-bold text-primary-foreground">حفظ الحالة</button>
          </form>
        </li>))}</ul>
      {(docs ?? []).length === 60 && <p className="text-sm text-muted-foreground">يُعرض أول 60؛ ضيّق البحث.</p>}
    </main></>
  );
}
