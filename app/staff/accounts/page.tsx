import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "الحسابات — BALADI ONE", referrer: "no-referrer" as const };
const ROLES: Record<string, string> = { staff: "موظف", mayor: "رئيس بلدية", admin: "مدير" };
const ERR: Record<string, string> = {
  exists: "هذا البريد مسجّل مسبقاً.", bad_email: "البريد الإلكتروني غير صالح.", weak_password: "كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف.",
  bad_municipality: "البلدية غير موجودة.", demo_not_admin: "حساب العرض لا يكون بدور مدير.", forbidden: "هذه الصفحة للمدير فقط.", failed: "تعذّر تنفيذ الطلب.",
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
    <main dir="rtl" lang="ar" className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <Link href="/staff" className="text-sm text-primary">← الطلبات</Link>
      <h1 className="text-2xl font-bold">الحسابات</h1>
      {sp.e && <p role="alert" className="rounded-xl border border-destructive p-3 text-sm text-destructive">{ERR[sp.e] ?? ERR.failed}</p>}
      {sp.ok && <p role="status" className="rounded-xl border bg-accent p-3 text-sm">{sp.ok === "created" ? "أُنشئ الحساب. سيُطلب من صاحبه تغيير كلمة المرور عند أول دخول." : "عُيّنت كلمة مرور مؤقتة جديدة. سيُطلب تغييرها عند الدخول."}</p>}
      <form action={create} className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">حساب جديد</h2>
        <input name="name" placeholder="الاسم" className="min-h-12 rounded-xl border bg-background px-3" />
        <input name="email" type="email" required placeholder="البريد الإلكتروني" dir="ltr" className="min-h-12 rounded-xl border bg-background px-3" />
        <input name="password" type="text" required minLength={8} placeholder="كلمة مرور مؤقتة (8 أحرف فأكثر)" dir="ltr" autoComplete="off" className="min-h-12 rounded-xl border bg-background px-3" />
        <select name="role" defaultValue="staff" className="min-h-12 rounded-xl border bg-background px-3">{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="demo" className="mt-1" /><span>حساب عرض (للمعرض): يجرّب تغيير حالة الطلبات التجريبية فقط، ولا يعتمد الخدمات ولا يرى طلبات حقيقية ولا ينشئ حسابات. لا يُلزَم بتغيير كلمة المرور.</span></label>
        <button className="min-h-12 rounded-xl bg-primary font-semibold text-primary-foreground sm:col-span-2">إنشاء الحساب</button>
        <p className="text-xs text-muted-foreground sm:col-span-2">أرسل كلمة المرور المؤقتة لصاحب الحساب بقناة خاصة. لا تظهر بعد الإنشاء.</p>
      </form>
      <ul className="divide-y rounded-xl border bg-background">
        {rows.map((r) => (
          <li key={r.user_id} className="space-y-2 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm"><b>{r.display_name || "—"}</b><span dir="ltr">{r.email}</span><span className="rounded bg-accent px-2 text-xs">{ROLES[r.role]}</span>{r.is_demo && <span className="rounded bg-accent px-2 text-xs text-accent-foreground">عرض</span>}{r.must_change_password && <span className="rounded bg-muted px-2 text-xs">بانتظار تغيير كلمة المرور</span>}<span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span></p>
            <form action={reset.bind(null, r.user_id)} className="flex gap-2">
              <input name="password" type="text" required minLength={8} placeholder="كلمة مرور مؤقتة جديدة" dir="ltr" autoComplete="off" className="min-h-10 flex-1 rounded-xl border bg-background px-3 text-sm" />
              <button className="min-h-10 rounded-xl border px-4 text-sm">إعادة تعيين</button>
            </form>
          </li>
        ))}
        {!rows.length && <li className="p-6 text-center text-muted-foreground">لا حسابات.</li>}
      </ul>
    </main>
  );
}
