import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { BRAND } from "@/lib/brand";
import { Intro, StepCard, Field, Chip, Empty, Notice, Explain, CONTROL, BTN_PRIMARY, BTN_SECONDARY } from "@/components/simple/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "الحسابات — BALADI ONE", referrer: "no-referrer" as const };
const ROLES: Record<string, string> = { staff: "موظف", mayor: "رئيس بلدية", admin: "مدير النظام" };
const ERR: Record<string, string> = {
  exists: "هذا البريد له حساب بالفعل.", bad_email: "البريد الإلكتروني غير صحيح. تأكد من كتابته.", weak_password: "كلمة السرّ المؤقتة قصيرة. اكتب 8 أحرف على الأقل.",
  bad_municipality: "لم نجد هذه البلدية.", demo_not_admin: "حساب التجربة لا يمكن أن يكون «مدير».", forbidden: "هذه الصفحة للمدير فقط.", failed: "لم نستطع تنفيذ الطلب. حاول مرة ثانية.",
};
const code = (m: string) => Object.keys(ERR).find((k) => m.includes(k)) ?? "failed";
const fmt = (d: string) => new Intl.DateTimeFormat("ar-LB", { dateStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(d));

async function create(formData: FormData) {
  "use server";
  const { sb } = await requireStaff();
  const role = String(formData.get("role") ?? "staff");
  if (!ROLES[role]) redirect("/staff/accounts?e=failed");
  const { error } = await sb.rpc("admin_create_staff", {
    p_email: String(formData.get("email") ?? ""), p_password: String(formData.get("password") ?? ""), p_role: role,
    p_name: String(formData.get("name") ?? ""), p_muni_slug: BRAND.slug, p_demo: formData.get("demo") === "on",
  });
  redirect(error ? `/staff/accounts?e=${code(error.message)}` : "/staff/accounts?ok=created");
}
async function reset(userId: string, formData: FormData) {
  "use server";
  const { sb } = await requireStaff();
  const { error } = await sb.rpc("admin_reset_password", { p_user: userId, p_password: String(formData.get("password") ?? "") });
  redirect(error ? `/staff/accounts?e=${code(error.message)}` : "/staff/accounts?ok=reset");
}

export default async function Accounts({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const { sb, memberships } = await requireStaff();
  if (!memberships.some((m) => m.role === "admin")) redirect("/staff");
  const sp = await searchParams;
  const { data } = await sb.rpc("admin_list_staff");
  const rows = (data ?? []) as any[];
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <Link href="/staff" className="inline-flex min-h-12 items-center text-base font-semibold text-primary">← الصفحة الرئيسية</Link>
      <Intro title="من يستعمل التطبيق؟">أضف موظفًا جديدًا ليدخل التطبيق، أو أعطِ أحدهم كلمة سرّ مؤقتة جديدة إذا نسي كلمته.</Intro>
      {sp.e && <Notice tone="bad">{ERR[sp.e] ?? ERR.failed}</Notice>}
      {sp.ok && <Notice>{sp.ok === "created" ? "تم إنشاء الحساب. سيُطلب من صاحبه اختيار كلمة سرّ خاصة عند أول دخول." : "تم تعيين كلمة سرّ مؤقتة جديدة. سيُطلب من صاحبها تغييرها عند الدخول."}</Notice>}
      <StepCard n={1} title="أضف شخصًا جديدًا" hint="اكتب اسمه وبريده، واختر عمله، ثم أعطه كلمة سرّ مؤقتة.">
      <form action={create} className="space-y-4">
        <Field label="الاسم" example="أحمد خليل"><input name="name" className={CONTROL} /></Field>
        <Field label="البريد الإلكتروني" hint="هذا ما سيكتبه ليدخل." example="ahmad@example.com" required><input name="email" type="email" required dir="ltr" className={CONTROL} /></Field>
        <Field label="كلمة سرّ مؤقتة" hint="8 أحرف أو أكثر. أرسلها له برسالة خاصة، فلا تظهر بعد الإنشاء." required><input name="password" type="text" required minLength={8} dir="ltr" autoComplete="off" className={CONTROL} /></Field>
        <Field label="ما عمله؟" hint="«موظف» يعمل على الطلبات. «رئيس بلدية» يرى كل شيء ويعتمد. «مدير النظام» يدير الحسابات والإعدادات."><select name="role" defaultValue="staff" className={CONTROL}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <details className="rounded-xl bg-muted/50 px-3 py-2"><summary className="cursor-pointer font-semibold">حقول إضافية</summary>
          <label className="flex items-start gap-2 pt-3 text-base"><input type="checkbox" name="demo" className="mt-1.5 size-5" /><span>حساب تجربة (للمعارض): يجرّب الأزرار على طلبات وهمية فقط. لا يرى طلبات حقيقية ولا يعتمد شيئًا ولا ينشئ حسابات، ولا يُطلب منه تغيير كلمة السرّ.</span></label></details>
        <button className={`${BTN_PRIMARY} w-full`}>إنشاء الحساب</button>
      </form>
      </StepCard>
      <h2 className="text-lg font-bold">الحسابات الحالية ({rows.length})</h2>
      <ul className="divide-y rounded-2xl border bg-background">
        {rows.map((r) => (
          <li key={r.user_id} className="space-y-3 p-4">
            <p className="flex flex-wrap items-center gap-2 text-base"><b className="text-lg">{r.display_name || "بدون اسم"}</b><span dir="ltr">{r.email}</span><Chip>{ROLES[r.role] ?? r.role}</Chip>{r.is_demo && <Chip>حساب تجربة</Chip>}{r.must_change_password && <Chip tone="wait">لم يغيّر كلمته المؤقتة بعد</Chip>}<span className="text-sm text-muted-foreground">أُنشئ {fmt(r.created_at)}</span></p>
            <details className="rounded-xl bg-muted/50 px-3 py-2"><summary className="cursor-pointer font-semibold">نسي كلمة السرّ؟</summary>
              <form action={reset.bind(null, r.user_id)} className="flex flex-wrap gap-2 pt-3">
                <input name="password" type="text" required minLength={8} aria-label="كلمة سرّ مؤقتة جديدة" placeholder="اكتب كلمة سرّ مؤقتة جديدة (8 أحرف فأكثر)" dir="ltr" autoComplete="off" className={`${CONTROL} min-w-52 flex-1`} />
                <button className={BTN_SECONDARY}>تعيين الكلمة</button>
              </form></details>
          </li>
        ))}
        {!rows.length && <li className="p-4"><Empty>لا توجد حسابات بعد. أضف أول شخص من النموذج أعلاه.</Empty></li>}
      </ul>
    </main>
  );
}
