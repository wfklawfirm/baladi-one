import Link from "next/link";
import Emblem from "./Emblem";

/** Header for the staff/mayor workspace: logo, back link, AIJUR logo. */
export default function StaffHeader({ back = "/staff", backLabel = "الرئيسية" }: { back?: string; backLabel?: string }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/staff" aria-label="الرئيسية"><Emblem size={44} /></Link>
        <Link href={back} className="rounded-xl border px-4 py-2 text-sm active:bg-muted">← {backLabel}</Link>
        <img src="/aijur-logo.png" alt="AIJUR" className="h-10 w-auto" />
      </div>
    </header>
  );
}
