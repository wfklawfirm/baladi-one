import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { Landmark, UserCog, Users } from "lucide-react";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";
import Emblem from "@/components/Emblem";

export const dynamic = "force-dynamic";

const panel = "group relative flex h-full w-full flex-col items-start gap-4 border px-8 pb-8 pt-9 text-start transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-focus)] active:brightness-95 disabled:pointer-events-none disabled:opacity-60 lg:min-h-[19rem]";

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) { if (slug !== BRAND.slug) redirect(`/m/${BRAND.slug}`); notFound(); }

  // Exhibition mode: employee / mayor open a restricted demo session; otherwise they lead to the normal login.
  // The whole panel is the touch target; the label at its foot is text, so there is one interaction, not two.
  const top = { borderTopColor: "var(--primary)" };
  const light = `${panel} border-border border-t-4 bg-background hover:bg-muted/40`;
  const body = (Icon: typeof Users, title: string, desc: string, label: string, dark = false) => (
    <>
      <Icon className={`size-9 ${dark ? "text-white" : "text-primary"}`} strokeWidth={1.25} aria-hidden />
      <b className="mt-2 text-3xl font-bold leading-snug lg:text-4xl">{title}</b>
      <span className={`text-lg ${dark ? "text-white/85" : "text-muted-foreground"}`}>{desc}</span>
      <span className={`mt-auto flex w-full items-center justify-between border-t pt-5 text-xl font-bold ${dark ? "border-white/30 text-white" : "border-border text-primary"}`}>
        {label}<span aria-hidden className="text-2xl">←</span>
      </span>
    </>
  );
  const staff = body(UserCog, "موظف البلدية", "إدارة الطلبات والخدمات", "دخول النظام");
  const mayor = body(Landmark, "رئيس البلدية", "متابعة الأعمال والأداء", "دخول الإدارة");

  return (
    <div dir="rtl" lang="ar" className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
          <Emblem size={56} />
          <img src="/aijur-logo.png" alt="AIJUR" className="h-12 w-auto" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col justify-center gap-12 px-6 py-10 lg:gap-14">
        <section className="max-w-3xl">
          <h1 className="text-5xl font-bold leading-tight tracking-tight lg:text-[clamp(3.25rem,3.4vw,4rem)]">منصتكم البلدية الذكية</h1>
          <p className="mt-4 text-xl text-muted-foreground lg:text-2xl">اختر طريقة الدخول إلى خدمات البلدية</p>
        </section>

        <section aria-label="اختر نوع المستخدم" className="grid grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
          <Link href={`/m/${slug}/citizen`} className={`${panel} border-primary bg-primary text-primary-foreground`}>
            {body(Users, "مواطن", "المعاملات والخدمات البلدية", "ابدأ الآن", true)}
          </Link>
          {muni.isDemo ? (
            <>
              <form action={enterDemo.bind(null, "staff")} className="h-full"><button style={top} className={light}>{staff}</button></form>
              <form action={enterDemo.bind(null, "mayor")} className="h-full"><button style={top} className={light}>{mayor}</button></form>
            </>
          ) : (
            <>
              <Link href="/staff/login" style={top} className={light}>{staff}</Link>
              <Link href="/staff/login" style={top} className={light}>{mayor}</Link>
            </>
          )}
        </section>
      </main>

      <footer className="border-t">
        <p className="mx-auto max-w-[1240px] px-6 py-4 text-sm text-muted-foreground">من تطوير AIJUR</p>
      </footer>
    </div>
  );
}
