import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BRAND, OFFICIAL } from "@/lib/brand";
import QRCode from "qrcode";
import { Landmark, UserCog, Users } from "lucide-react";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";
import Emblem from "@/components/Emblem";

export const dynamic = "force-dynamic";

const card = "ch-card group flex h-full w-full flex-col items-center gap-4 rounded-[22px] border px-7 pb-8 pt-9 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-focus)] active:scale-[0.985] active:brightness-95 disabled:pointer-events-none disabled:opacity-60";
const cta = "ch-cta mt-auto flex h-16 w-full items-center justify-center rounded-2xl text-xl font-bold";

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) { if (slug !== BRAND.slug) redirect(`/m/${BRAND.slug}`); notFound(); }

  // Exhibition mode: employee / mayor open a restricted demo session; otherwise they lead to the normal login.
  // The whole card is the touch target; the "button" is a label inside it, so there is one interaction, not two.
  const light = `${card} border-border bg-background shadow-[0_4px_18px_rgb(0_0_0/0.07)] hover:border-primary hover:bg-gradient-to-b hover:from-[#86233a] hover:to-[#6b1a29] hover:text-white hover:shadow-[0_10px_28px_rgb(122_31_46/0.30)]`;
  const body = (Icon: typeof Users, title: string, desc: string, label: string, dark = false) => (
    <>
      <span className={`grid size-20 place-items-center rounded-3xl ${dark ? "bg-white/15" : "bg-accent group-hover:bg-white/15"}`}>
        <Icon className={`size-9 ${dark ? "text-white" : "text-primary group-hover:text-white"}`} strokeWidth={1.6} aria-hidden />
      </span>
      <b className="mt-2 text-3xl font-bold leading-snug">{title}</b>
      <span className={`mb-4 text-xl font-medium ${dark ? "text-white/90" : "text-muted-foreground group-hover:text-white/90"}`}>{desc}</span>
      <span className={`${cta} ${dark ? "bg-white text-primary" : "border-2 border-primary text-primary group-hover:border-white group-hover:bg-white"}`}>{label}</span>
    </>
  );
  const staff = body(UserCog, "موظف البلدية", "إدارة الطلبات والخدمات", "دخول النظام");
  const mayor = body(Landmark, "رئيس البلدية", "متابعة الأعمال والأداء", "دخول الإدارة");

  // Real QR (SVG, burgundy on white, quiet zone included) pointing straight at the official site: no intermediate link.
  const qr = await QRCode.toString(OFFICIAL.home, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#7a1f2e", light: "#ffffff" } });

  return (
    <div dir="rtl" lang="ar" className="flex min-h-dvh flex-col bg-background">
      <header className="ch-header h-28 border-b border-border/70 lg:h-32">
        <div className="mx-auto flex h-full max-w-[77.5rem] items-center justify-end px-6">
          <img src="/aijur-logo.png" alt="AIJUR" className="ch-aijur h-24 w-auto" />
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center">
      <main className="ch-main mx-auto flex w-full max-w-[72.5rem] flex-col items-center gap-8 px-6 pt-6 text-center lg:gap-8">
        <section className="flex max-w-3xl flex-col items-center gap-4">
          <h1 className="sr-only">البلدية الذكية</h1>
          <div className="ch-logo min-[2400px]:[zoom:1.9]"><Emblem size={170} /></div>
        </section>

        <section aria-label="اختر نوع المستخدم" className="grid w-full grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
          <Link href={`/m/${slug}/citizen`} className={light}>
            {body(Users, "مواطن", "المعاملات والخدمات البلدية", "ابدأ الآن")}
          </Link>
          {muni.isDemo ? (
            <>
              <form action={enterDemo.bind(null, "staff")} className="h-full"><button className={light}>{staff}</button></form>
              <form action={enterDemo.bind(null, "mayor")} className="h-full"><button className={light}>{mayor}</button></form>
            </>
          ) : (
            <>
              <Link href="/staff/login" className={`${light}`}>{staff}</Link>
              <Link href="/staff/login" className={`${light}`}>{mayor}</Link>
            </>
          )}
        </section>

        <section aria-label="الموقع الرسمي للبلدية" className="ch-qr flex w-full max-w-3xl items-center justify-center gap-6 rounded-2xl border border-border bg-background px-6 py-4 shadow-[0_1px_8px_rgb(0_0_0/0.04)] max-sm:flex-col max-sm:text-center lg:gap-8 lg:px-8">
          <div role="img" aria-label="رمز QR للموقع الرسمي للبلدية" className="size-32 shrink-0 lg:size-[9.5rem] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="flex flex-col items-start gap-2 max-sm:items-center">
            <h2 className="text-xl font-bold text-primary lg:text-2xl">اكتشف الموقع الرسمي للبلدية</h2>
            <p className="max-w-md text-lg leading-relaxed text-foreground/80">تابع أخبار البلدية وإعلاناتها ومشاريعها وخدماتها الرسمية.</p>
            <a href={OFFICIAL.home} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl max-sm:w-full max-sm:bg-primary max-sm:text-primary-foreground border-2 border-primary px-6 text-base font-bold text-primary max-sm:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-focus)] active:bg-accent">زيارة الموقع الرسمي</a>
          </div>
        </section>
      </main>

      <footer className="ch-footer pb-5 pt-6 text-center text-base text-muted-foreground">من تطوير AIJUR</footer>
      </div>
    </div>
  );
}
