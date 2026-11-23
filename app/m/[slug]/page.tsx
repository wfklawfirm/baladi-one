import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Landmark, UserCog, Users } from "lucide-react";
import Emblem from "@/components/Emblem";
import PortalFooter from "@/components/PortalFooter";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";

export const dynamic = "force-dynamic";

const ROLES = [
  { id: "citizen", Icon: Users, title: "مواطن", text: "معاملات وبلاغات ومتابعة" },
  { id: "staff", Icon: UserCog, title: "موظف البلدية", text: "استلام الطلبات ومعالجتها" },
  { id: "mayor", Icon: Landmark, title: "رئيس البلدية", text: "إشراف واعتماد الخدمات" },
] as const;

export default async function RoleChooser({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const muni = await loadMunicipality(slug);
  if (!muni) notFound();
  // Role choice is an exhibition feature; a live municipality opens straight on the citizen portal.
  if (!muni.isDemo) redirect(`/m/${slug}/citizen`);

  const body = (r: (typeof ROLES)[number]) => (
    <>
      <span className="grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground sm:size-20"><r.Icon className="size-8 sm:size-10" aria-hidden /></span>
      <b className="mt-3 text-base leading-snug sm:text-xl">{r.title}</b>
      <span className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{r.text}</span>
    </>
  );
  const cls = "elev elev-hover flex h-full w-full flex-col items-center justify-start rounded-3xl border bg-background px-2 py-5 text-center active:bg-muted min-h-44 sm:px-4 sm:py-7";

  return (
    <main dir="rtl" lang="ar">
      <section className="px-4 pb-6 pt-10">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <div className="flex justify-center"><Emblem size={104} /></div>
          <p className="flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-muted-foreground" dir="ltr">
            <span className="h-px w-8 bg-border" />BY AIJUR · INTELLIGENT MUNICIPAL SERVICES<span className="h-px w-8 bg-border" />
          </p>
          <p className="mx-auto inline-block rounded-full bg-accent px-4 py-1.5 text-xs text-accent-foreground">نسخة تجريبية — المحتوى غير معتمد</p>
          <h1 className="text-3xl font-bold leading-snug md:text-4xl">جرّب المنصة بدورك</h1>
          <p className="text-muted-foreground">اختر دورًا لترى الخدمات والمحتوى الخاص به.</p>
        </div>
      </section>
      <div className="mx-auto max-w-2xl px-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {ROLES.map((r) =>
          r.id === "citizen" ? (
            <Link key={r.id} href={`/m/${slug}/citizen`} className={cls}>{body(r)}</Link>
          ) : (
            <form key={r.id} action={enterDemo.bind(null, r.id)} className="h-full"><button className={cls}>{body(r)}</button></form>
          ),
        )}
        </div>
        <p className="pt-5 text-center text-sm text-muted-foreground">
          حسابات العرض تتعامل مع طلبات تجريبية فقط. <Link href="/staff/login" className="font-semibold text-primary">الدخول بحساب حقيقي</Link>
        </p>
      </div>
      <PortalFooter />
    </main>
  );
}
