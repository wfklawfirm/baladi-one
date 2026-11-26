import Link from "next/link";
import { cookies } from "next/headers";
import { BRAND } from "@/lib/brand";

/** Contact block: the municipality name lives here, not under the logo (the logo already carries it). */
export default async function PortalFooter() {
  // Visitors who came through the citizen-only page (/c) never see the staff entry.
  const citizenOnly = (await cookies()).get("portal")?.value === "c";
  return (
    <footer className="mt-16 border-t bg-muted/40 px-4 py-8">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
        <p className="text-lg font-bold">{BRAND.nameAr}</p>
        {!citizenOnly && <Link href="/staff" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">دخول الموظفين</Link>}
        <p className="text-sm text-muted-foreground">من تطوير AIJUR</p>
      </div>
    </footer>
  );
}
