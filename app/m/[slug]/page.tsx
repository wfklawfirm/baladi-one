import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Landmark, UserCog, Users } from "lucide-react";
import Emblem from "@/components/Emblem";
import { loadMunicipality } from "@/lib/catalog";
import { enterDemo } from "./actions";

export const dynamic = "force-dynamic";

const ROLES = [
  { id: "citizen", Icon: Users, title: "مواطن" },
  { id: "staff", Icon: UserCog, title: "موظف البلدية" },
  { id: "mayor", Icon: Landmark, title: "رئيس البلدية" },
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
      <b className="mt-4 text-base leading-snug sm:text-xl">{r.title}</b>
    </>
  );
  const cls = "elev elev-hover flex h-full w-full flex-col items-center justify-center rounded-3xl border bg-background px-2 py-7 text-center active:bg-muted min-h-40 sm:py-9";

  return (
    <main dir="rtl" lang="ar" className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-2xl flex-col justify-center gap-10 px-4 py-10">
      <div className="flex justify-center"><Emblem size={128} /></div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {ROLES.map((r) =>
          r.id === "citizen" ? (
            <Link key={r.id} href={`/m/${slug}/citizen`} className={cls}>{body(r)}</Link>
          ) : (
            <form key={r.id} action={enterDemo.bind(null, r.id)} className="h-full"><button className={cls}>{body(r)}</button></form>
          ),
        )}
      </div>
      <Link href="/staff/login" className="mx-auto text-sm text-muted-foreground hover:text-primary">دخول بحساب حقيقي</Link>
    </main>
  );
}
