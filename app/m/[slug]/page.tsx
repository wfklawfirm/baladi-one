import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Landmark, UserCog, Users } from "lucide-react";
import Emblem from "@/components/Emblem";
import PortalFooter from "@/components/PortalFooter";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";

export const dynamic = "force-dynamic";

const ROLES = [
  { id: "citizen", Icon: Users, title: "مواطن", text: "ابحث عن معاملتك وتعرّف على مستنداتها، وأبلغ عن مشكلة وتابع طلبك.", chips: ["المعاملات البلدية", "البلاغات", "متابعة الطلب"] },
  { id: "staff", Icon: UserCog, title: "موظف البلدية", text: "استلم طلبات المواطنين وبلاغاتهم، وغيّر حالتها وتابع معالجتها.", chips: ["قائمة الطلبات", "تغيير الحالة", "سجل المتابعة"] },
  { id: "mayor", Icon: Landmark, title: "رئيس البلدية", text: "راقب الطلبات على مستوى البلدية، واطّلع على الخدمات المعروضة للاعتماد.", chips: ["نظرة عامة", "اعتماد الخدمات", "الإشراف"] },
] as const;

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  // Role choice is an exhibition feature; a live municipality opens straight on the citizen portal.
  if (!muni.isDemo) redirect(`/m/${slug}/citizen`);

  const body = (r: (typeof ROLES)[number]) => (
    <>
      <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><r.Icon className="size-9" aria-hidden /></span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <b className="block text-xl">{r.title}</b>
        <span className="block text-sm leading-6 text-muted-foreground">{r.text}</span>
        <span className="flex flex-wrap gap-1.5 pt-1">{r.chips.map((c) => <span key={c} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">{c}</span>)}</span>
      </span>
      <ChevronLeft className="size-7 shrink-0 text-primary" aria-hidden />
    </>
  );
  const cls = "elev elev-hover flex w-full items-center gap-4 rounded-3xl border bg-background p-5 text-start active:bg-muted min-h-32";

  return (
    <main dir="rtl" lang="ar">
      <section className="px-4 pb-6 pt-10">
        <div className="mx-auto max-w-2xl space-y-5 text-center">
          <div className="flex justify-center"><Emblem size={128} /></div>
          <p className="flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-muted-foreground" dir="ltr">
            <span className="h-px w-8 bg-border" />BY AIJUR · INTELLIGENT MUNICIPAL SERVICES<span className="h-px w-8 bg-border" />
          </p>
          <p className="mx-auto inline-block rounded-full bg-accent px-4 py-1.5 text-xs text-accent-foreground">نسخة تجريبية — المحتوى غير معتمد</p>
          <h1 className="pt-2 text-3xl font-bold leading-snug md:text-4xl">جرّب المنصة بدورك</h1>
          <p className="text-muted-foreground">اختر دورًا لترى الخدمات والمحتوى الخاص به.</p>
        </div>
      </section>
      <div className="mx-auto max-w-2xl space-y-3 px-4">
        {ROLES.map((r) =>
          r.id === "citizen" ? (
            <Link key={r.id} href={`/m/${slug}/citizen`} className={cls}>{body(r)}</Link>
          ) : (
            <form key={r.id} action={enterDemo.bind(null, r.id)}><button className={cls}>{body(r)}</button></form>
          ),
        )}
        <p className="pt-2 text-center text-sm text-muted-foreground">
          حسابات العرض تتعامل مع طلبات تجريبية فقط. <Link href="/staff/login" className="font-semibold text-primary">الدخول بحساب حقيقي</Link>
        </p>
      </div>
      <PortalFooter />
    </main>
  );
}
