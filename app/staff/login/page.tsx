import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "دخول الموظفين — BALADI ONE" };

async function signIn(formData: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: String(formData.get("email") ?? "").trim(), password: String(formData.get("password") ?? "") });
  redirect(error ? "/staff/login?error=1" : "/staff");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; denied?: string }> }) {
  const sp = await searchParams;
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-sm space-y-4 p-6">
      <p className="text-sm font-semibold text-primary">BALADI ONE</p>
      <h1 className="text-2xl font-bold">دخول موظفي البلدية</h1>
      {sp.error && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">بيانات الدخول غير صحيحة.</p>}
      {sp.denied && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">حسابك غير مفوَّض لأي بلدية. تواصل مع المسؤول.</p>}
      <form action={signIn} className="space-y-3">
        <input name="email" type="email" required autoComplete="username" placeholder="البريد الإلكتروني" dir="ltr" className="min-h-12 w-full rounded-xl border bg-background px-3" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="كلمة المرور" dir="ltr" className="min-h-12 w-full rounded-xl border bg-background px-3" />
        <button className="min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground">دخول</button>
      </form>
    </main>
  );
}
