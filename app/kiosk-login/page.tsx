import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { kioskAllowed, safeKioskNext } from "@/lib/kioskAccess";

export const dynamic = "force-dynamic";
export const metadata = { title: "دخول العرض — BALADI ONE", robots: { index: false } };

async function signIn(formData: FormData) {
  "use server";
  const next = safeKioskNext(formData.get("next"));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: String(formData.get("email") ?? "").trim(), password: String(formData.get("password") ?? "") });
  if (error) redirect(`/kiosk-login?error=1&next=${encodeURIComponent(next)}`);
  if (!(await kioskAllowed())) { await sb.auth.signOut(); redirect(`/kiosk-login?denied=1&next=${encodeURIComponent(next)}`); }
  redirect(next === "/" ? "/kiosk/khreibet-al-jundi" : next);
}

export default async function KioskLogin({ searchParams }: { searchParams: Promise<{ error?: string; denied?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = safeKioskNext(sp.next);
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-sm space-y-4 p-6 pt-16">
      <h1 className="text-2xl font-bold">عرض بلدية خريبة الجندي</h1>
      <p className="text-sm text-muted-foreground">هذا العرض خاص. سجّل الدخول بالحساب الذي زُوِّدت به.</p>
      {sp.error && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">بيانات الدخول غير صحيحة.</p>}
      {sp.denied && <p role="alert" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">هذا الحساب غير مصرّح له بعرض الكشك.</p>}
      <form action={signIn} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <input name="email" type="email" required autoComplete="username" placeholder="البريد الإلكتروني" dir="ltr" className="min-h-12 w-full rounded-xl border bg-background px-3" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="كلمة المرور" dir="ltr" className="min-h-12 w-full rounded-xl border bg-background px-3" />
        <button className="min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground">دخول</button>
      </form>
    </main>
  );
}
