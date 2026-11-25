"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerRequest } from "@/app/s/[slug]/[service]/actions";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

/** Registration form for "start this transaction". scale="kiosk" uses rem sizes for large touch screens. */
export function RequestForm({ slug, serviceSlug, channel, lang, onDone }: {
  slug: string; serviceSlug: string; channel: "kiosk" | "app"; lang: Lang; onDone?: (code: string, title: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const k = channel === "kiosk";
  const field = k ? "min-h-[3.75rem] w-full rounded-2xl border-2 bg-background px-5 text-[1.35rem] outline-none focus:border-primary" : "min-h-12 w-full rounded-xl border bg-background px-3";
  const label = k ? "block text-[1.3rem] font-semibold" : "block font-semibold";
  return (
    <form noValidate className={k ? "space-y-3" : "space-y-4"} onSubmit={async (e) => {
      e.preventDefault(); setErr(null); setBusy(true);
      const f = new FormData(e.currentTarget);
      const r = await registerRequest(slug, serviceSlug, channel, lang, { name: String(f.get("name") ?? ""), phone: String(f.get("phone") ?? ""), note: String(f.get("note") ?? ""), website: String(f.get("website") ?? "") });
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      if (onDone) onDone(r.code, r.title); else router.push(`/m/${slug}/track?code=${r.code}&new=1${lang === "en" ? "&lang=en" : ""}`);
    }}>
      <div className="space-y-1.5"><label htmlFor="rq-name" className={label}>{t(lang, "fullName")}</label>
        <input id="rq-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className={field} /></div>
      <div className="space-y-1.5"><label htmlFor="rq-phone" className={label}>{t(lang, "phoneLabel")}</label>
        <input id="rq-phone" name="phone" required inputMode="tel" maxLength={20} autoComplete="tel" dir="ltr" className={`${field} text-start`} /></div>
      <div className="space-y-1.5"><label htmlFor="rq-note" className={label}>{t(lang, "noteLabel")}</label>
        <textarea id="rq-note" name="note" rows={k ? 2 : 3} maxLength={1000} className={`${field} py-3`} /></div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {err && <p role="alert" className={`rounded-xl bg-accent text-accent-foreground ${k ? "p-5 text-[1.3rem]" : "p-3 text-sm"}`}>{err}</p>}
      <button disabled={busy} className={`w-full bg-primary font-bold text-primary-foreground transition active:scale-[0.99] disabled:opacity-60 ${k ? "min-h-[4.5rem] rounded-2xl text-[1.6rem]" : "min-h-14 rounded-xl text-lg"}`}>{busy ? t(lang, "sending") : t(lang, "sendRequest")}</button>
      <p className={`text-muted-foreground ${k ? "text-[1.15rem]" : "text-xs"}`}>{t(lang, "applyNote")}{k ? ` ${t(lang, "kioskPrivacy")}` : ""}</p>
    </form>
  );
}
