import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "تغيير كلمة المرور — BALADI ONE", referrer: "no-referrer" as const };

async function change(formData: FormData) {
  "use server";
  const { sb } = await requireStaff({ allowPasswordChange: true });
  const a = String(formData.get("password") ?? ""), b = String(formData.get("confirm") ?? "");
  if (a.length < 10) redirect("/staff/password?e=short");
  if (a !== b) redirect("/staff/password?e=mismatch");
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) redirect("/staff/password?e=failed");
  await sb.rpc("staff_password_changed");
  redirect("/staff");
}

const ERR: Record<string, string> = { short: "كلمة المرور يجب ألا تقل عن 10 أحرف.", mismatch: "كلمتا المرور غير متطابقتين.", failed: "تعذّر تغيير كلمة المرور. جرّب كلمة أقوى أو مختلفة عن المؤقتة." };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireStaff({ allowPasswordChange: true });
  const e = ERR[(await searchParams).e ?? ""];
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-sm space-y-4 p-6">
      <p className="text-sm font-semibold text-primary">BALADI ONE</p>
      <h1 className="text-2xl font-bold">اختر كلمة مرور جديدة</h1>
      <p className="text-sm text-muted-foreground">كلمة المرور الحالية مؤقتة. يجب تغييرها قبل المتابعة.</p>
      {e && <p role="alert" className="rounded-xl border border-destructive p-3 text-sm text-destructive">{e}</p>}
      <form action={change} className="space-y-3">
        <input type="password" name="password" required minLength={10} autoComplete="new-password" placeholder="كلمة المرور الجديدة (10 أحرف فأكثر)" dir="ltr" className="min-h-12 w-full rounded-xl border bg-background px-3" />
        <input type="password" name="confirm" required minLength={10} autoComplete="new-password" placeholder="تأكيد كلمة المرور" dir="ltr" className="min-h-12 w-full rounded-xl border bg-background px-3" />
        <button className="min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground">حفظ ومتابعة</button>
      </form>
    </main>
  );
}
