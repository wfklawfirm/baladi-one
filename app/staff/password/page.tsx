import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase-server";
import { Intro, Field, Notice, Explain, CONTROL, BTN_PRIMARY } from "@/components/simple/kit";

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

const ERR: Record<string, string> = { short: "كلمة المرور قصيرة. اكتب 10 أحرف على الأقل.", mismatch: "الكلمتان غير متطابقتين. اكتبهما مرة أخرى بالشكل نفسه.", failed: "لم نستطع حفظ الكلمة. جرّب كلمة أقوى، ومختلفة عن الكلمة المؤقتة." };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireStaff({ allowPasswordChange: true });
  const e = ERR[(await searchParams).e ?? ""];
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-sm space-y-4 p-6">
      <Intro title="اختر كلمة سرّ جديدة">الكلمة التي دخلت بها مؤقتة. اختر كلمة خاصة بك لا يعرفها غيرك، ثم تابع.</Intro>
      {e && <Notice tone="bad">{e}</Notice>}
      <form action={change} className="space-y-4">
        <Field label="كلمة السرّ الجديدة" hint="10 أحرف أو أكثر. الأفضل أن تجمع كلمات وأرقامًا." example="بيتي-بالجبل-2026" required><input type="password" name="password" required minLength={10} autoComplete="new-password" dir="ltr" className={CONTROL} /></Field>
        <Field label="اكتبها مرة ثانية" hint="للتأكد أنك كتبتها بشكل صحيح." required><input type="password" name="confirm" required minLength={10} autoComplete="new-password" dir="ltr" className={CONTROL} /></Field>
        <Explain term="كلمة سرّ مؤقتة">كلمة أعطاك إياها المسؤول لتدخل أول مرة فقط. لهذا يطلب منك التطبيق استبدالها بكلمتك الخاصة.</Explain>
        <button className={`${BTN_PRIMARY} w-full`}>حفظ ومتابعة</button>
      </form>
    </main>
  );
}
