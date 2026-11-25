"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, ChevronLeft, ClipboardCheck, FileBadge, FileSearch, HardHat, Home, Languages, Megaphone, Search, Smartphone, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CATEGORIES, catLabel, pick, t } from "@/lib/i18n";
import { filterServices } from "@/lib/search";
import type { CategoryId, Lang, Municipality, Service } from "@/lib/types";
import { Qr } from "./Qr";
import { ServiceBody } from "./ServiceBody";
import Mic from "@/components/Mic";

type View = { name: "home" } | { name: "list" } | { name: "service"; slug: string } | { name: "report" } | { name: "track" };

const WARN_SECONDS = 15;
const CAT_ICON: Record<CategoryId, LucideIcon> = { licenses: Building2, certificates: FileBadge, shops: Store, public_works: HardHat, reports: Megaphone };
const SUGGESTIONS = ["رخصة بناء", "رخصة ترميم", "براءة ذمة", "تسجيل عقود الإيجار"];

export function Kiosk({
  muni, services, demo, reportsEnabled, idleSeconds, initialLang,
}: { muni: Municipality; services: Service[]; demo: boolean; reportsEnabled: boolean; idleSeconds: number; initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>({ name: "home" });
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [warn, setWarn] = useState<number | null>(null);
  const last = useRef(Date.now());
  const dir = lang === "ar" ? "rtl" : "ltr";
  // Narrow windows cannot fit the kiosk layout: hand over to the mobile portal.
  useEffect(() => { if (window.matchMedia("(max-width: 820px)").matches && !location.search.includes("force=1")) location.replace(`/m/${muni.slug}${initialLang === "en" ? "?lang=en" : ""}`); }, [muni.slug, initialLang]);

  const reset = useCallback(() => { setView({ name: "home" }); setQuery(""); setCat("all"); setWarn(null); setLang(initialLang); }, [initialLang]);
  const touch = useCallback(() => { last.current = Date.now(); setWarn(null); }, []);

  // Idle: warn WARN_SECONDS before the reset; reset clears every trace of the previous visitor.
  useEffect(() => {
    const ev = ["pointerdown", "keydown", "touchstart"] as const;
    ev.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const iv = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000;
      if (idle >= idleSeconds) { reset(); last.current = Date.now(); return; }
      const left = Math.ceil(idleSeconds - idle);
      if (view.name !== "home" && left <= WARN_SECONDS) setWarn(left); else setWarn(null);
    }, 500);
    return () => { ev.forEach((e) => window.removeEventListener(e, touch)); clearInterval(iv); };
  }, [idleSeconds, reset, touch, view.name]);

  const results = useMemo(() => filterServices(services, query, cat, lang), [services, query, cat, lang]);
  const service = view.name === "service" ? services.find((s) => s.slug === view.slug) : undefined;
  // One step back: service -> list -> home; report/track -> home.
  const goBack = () => setView(view.name === "service" ? { name: "list" } : { name: "home" });
  const goList = (q?: string) => { if (q !== undefined) setQuery(q); setView({ name: "list" }); };

  // Primary = the one action that always works; secondary cards become "coming soon" (not clickable) until enabled.
  const Card = ({ icon, title, hint, onClick, disabled, primary }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void; disabled?: boolean; primary?: boolean }) => {
    const body = (
      <>
        <span className="flex items-center justify-between">
          <span className={`grid size-[5.5rem] shrink-0 place-items-center rounded-2xl ${primary ? "bg-primary text-primary-foreground" : disabled ? "border bg-background text-muted-foreground" : "bg-accent text-primary"}`}>{icon}</span>
          {disabled
            ? <span className="rounded-full border bg-background px-5 py-2 text-[1.15rem] font-semibold text-foreground">{t(lang, "comingSoon")}</span>
            : <ChevronLeft className={`size-10 text-primary ${dir === "ltr" ? "rotate-180" : ""}`} aria-hidden />}
        </span>
        <span className="mt-auto flex flex-col gap-2">
          <span className="text-[2rem] font-bold leading-tight">{title}</span>
          <span className="text-[1.3rem] leading-snug text-muted-foreground">{hint}</span>
        </span>
      </>
    );
    const base = "flex min-h-[16rem] flex-col gap-6 rounded-3xl border p-8 text-start";
    if (disabled) return <div role="group" aria-disabled="true" className={`${base} border-dashed bg-muted/60`}>{body}</div>;
    return (
      <button onClick={onClick}
        className={`${base} elev elev-hover transition active:scale-[0.985] ${primary ? "border-primary/40 bg-accent/60 active:bg-accent" : "bg-background active:bg-muted"}`}>
        {body}
      </button>
    );
  };

  const Btn = ({ children, onClick, variant = "primary", disabled }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary"; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onClick}
      className={`inline-flex min-h-[4.5rem] items-center justify-center gap-3 rounded-2xl px-8 text-[1.5rem] font-bold transition active:scale-[0.98] disabled:opacity-60 ${variant === "primary" ? "bg-primary text-primary-foreground elev" : "border bg-background text-foreground hover:bg-muted"}`}>
      {children}
    </button>
  );

  return (
    <div dir={dir} lang={lang} className="flex h-dvh w-full select-none flex-col overflow-hidden bg-page px-[4vw] pb-[1.6vh] pt-[2vh]">
      {/* top bar */}
      <header className="flex shrink-0 items-center justify-between border-b pb-[1.6vh]">
        <div className="flex items-center gap-6">
          {muni.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={muni.logoUrl} alt={lang === "en" && muni.nameEn ? muni.nameEn : muni.nameAr} className="h-[5.5rem] w-auto max-w-[12rem] object-contain" />
            : <span className="grid size-16 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">B</span>}
          <span className="hidden h-12 w-px bg-border lg:block" aria-hidden />
          <p className="hidden text-[1.6rem] font-semibold text-muted-foreground lg:block">{t(lang, "headerTitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          {view.name !== "home" && (
            <nav aria-label={t(lang, "home")} className="flex items-center gap-3">
              <Btn variant="secondary" onClick={goBack}><ArrowRight className={`size-7 ${dir === "ltr" ? "rotate-180" : ""}`} aria-hidden />{t(lang, "back")}</Btn>
              <Btn onClick={reset}><Home className="size-7" aria-hidden />{t(lang, "home")}</Btn>
            </nav>
          )}
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="inline-flex min-h-16 items-center gap-3 rounded-2xl border bg-background px-6 text-[1.25rem] font-semibold transition active:scale-[0.98] active:bg-muted">
            <Languages className="size-6" />{t(lang, "language")}
          </button>
        </div>
      </header>

      {/* body */}
      <main className="min-h-0 flex-1 overflow-y-auto py-[1.5vh]">
        {view.name === "home" && (
          <div className="mx-auto flex min-h-full w-full max-w-[104rem] flex-col justify-center gap-[4.5vh]">
            <div className="text-center">
              <h1 className="text-[3.5rem] font-bold leading-tight">{t(lang, "heroTitle")}</h1>
              <p className="mt-3 text-[1.6rem] text-muted-foreground">{t(lang, "heroSub")}</p>
              <form className="mx-auto mt-[3.5vh] flex w-full max-w-[64rem] items-center gap-3 rounded-3xl border-2 bg-background py-2 ps-7 pe-2.5 elev focus-within:border-primary focus-within:shadow-[var(--ring-focus)]"
                role="search" onSubmit={(e) => { e.preventDefault(); goList(query); }}>
                <Search className="size-8 shrink-0 text-muted-foreground" aria-hidden />
                <input id="kq-home" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(lang, "searchPlaceholder")} aria-label={t(lang, "heroSub")}
                  className="h-[4.5rem] min-w-0 flex-1 bg-transparent text-[1.6rem] outline-none focus-visible:!shadow-none placeholder:text-muted-foreground" enterKeyHint="search" />
                <Mic target="kq-home" mode="replace" size="lg" />
                <button type="submit" className="min-h-[4.5rem] shrink-0 rounded-2xl bg-primary px-10 text-[1.5rem] font-bold text-primary-foreground transition active:scale-[0.98]">{t(lang, "open")}</button>
              </form>
              {lang === "ar" && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <span className="text-[1.2rem] text-muted-foreground">{t(lang, "suggestionsLabel")}</span>
                  {SUGGESTIONS.map((q) => (
                    <button key={q} onClick={() => goList(q)}
                      className="min-h-14 rounded-full border bg-background px-6 text-[1.25rem] font-medium transition active:scale-[0.98] active:bg-muted">{q}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card primary icon={<FileSearch className="size-11" />} title={t(lang, "transactions")} hint={t(lang, "transactionsHint")} onClick={() => goList("")} />
              <Card icon={<Megaphone className="size-11" />} title={t(lang, "report")} hint={t(lang, "reportHint")} onClick={() => setView({ name: "report" })} disabled={!reportsEnabled} />
              <Card icon={<ClipboardCheck className="size-11" />} title={t(lang, "track")} hint={t(lang, "trackHint")} onClick={() => setView({ name: "track" })} disabled={!reportsEnabled} />
            </div>
          </div>
        )}

        {view.name === "list" && (
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-center gap-3 rounded-3xl border-2 bg-background px-6 elev focus-within:border-primary focus-within:shadow-[var(--ring-focus)]">
              <Search className="size-7 text-muted-foreground" aria-hidden />
              <input id="kq-list" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(lang, "searchPlaceholder")}
                className="h-16 min-w-0 flex-1 bg-transparent text-[1.5rem] outline-none focus-visible:!shadow-none placeholder:text-muted-foreground" />
              <Mic target="kq-list" mode="replace" />
            </div>
            <div className="flex flex-wrap gap-3">
              {(["all", ...CATEGORIES] as const).map((c) => (
                <button key={c} onClick={() => setCat(c)}
                  className={`inline-flex min-h-14 items-center gap-2 rounded-2xl border px-6 text-[1.2rem] font-semibold ${cat === c ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                  {c !== "all" && (() => { const Ic = CAT_ICON[c]; return <Ic className="size-6" aria-hidden />; })()}
                  {c === "all" ? t(lang, "all") : catLabel(lang, c)}
                </button>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-4 overflow-y-auto pb-2 xl:grid-cols-2">
              {services.length === 0 && <p className="col-span-full py-16 text-center text-[1.6rem] text-muted-foreground">{t(lang, "noCatalog")}</p>}
              {services.length > 0 && results.length === 0 && <p className="col-span-full py-16 text-center text-[1.6rem] text-muted-foreground">{t(lang, "noResults")}</p>}
              {results.map((s) => (
                <button key={s.slug} onClick={() => setView({ name: "service", slug: s.slug })}
                  className="elev elev-hover flex min-h-28 items-center gap-5 rounded-2xl border bg-background p-5 text-start transition active:scale-[0.99]">
                  {(() => { const Ic = CAT_ICON[s.category] ?? FileSearch; return <span className="grid size-[4.5rem] shrink-0 place-items-center rounded-2xl bg-accent text-primary"><Ic className="size-9" aria-hidden /></span>; })()}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[1.5rem] font-bold">{pick(lang, s.title)}</span>
                    <span className="text-[1.1rem] text-primary">{catLabel(lang, s.category)}</span>
                    <span className="line-clamp-2 text-[1.15rem] text-muted-foreground">{pick(lang, s.summary)}</span>
                  </span>
                  <ChevronLeft className={`size-9 shrink-0 text-primary ${dir === "ltr" ? "rotate-180" : ""}`} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}

        {view.name === "service" && service && (
          <div className="flex h-full gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <p className="text-[1.1rem] text-primary">{catLabel(lang, service.category)}</p>
                <h2 className="text-[2.4rem] font-bold leading-tight">{pick(lang, service.title)}</h2>
                <p className="mt-1 text-[1.3rem] text-muted-foreground">{pick(lang, service.summary)}</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-2"><ServiceBody s={service} lang={lang} scale="kiosk" /></div>
            </div>
            <aside className="flex w-[27%] shrink-0 flex-col items-center gap-4 rounded-3xl border bg-background p-6 elev">
              <Smartphone className="size-10 text-primary" />
              <Qr path={service.phonePath ?? `/s/${muni.slug}/${service.slug}?lang=${lang}`} size={300} label={t(lang, "continueOnPhone")} />
              <p className="text-center text-[1.3rem] font-semibold">{t(lang, "continueOnPhone")}</p>
              <p className="text-center text-[1.05rem] text-muted-foreground">{t(lang, "scanQr")}</p>
              {service.onlineEnabled && reportsEnabled
                ? <Btn>{t(lang, "startOnline")}</Btn>
                : <p className="rounded-xl bg-muted p-3 text-center text-[1.05rem] text-muted-foreground">{t(lang, "notOnline")}</p>}
            </aside>
          </div>
        )}

        {(view.name === "report" || view.name === "track") && (
          <div className="grid h-full place-items-center">
            <div className="flex max-w-3xl flex-col items-center gap-6 rounded-3xl border bg-background p-10 text-center elev">
              <p className="text-[2rem] font-bold">{t(lang, view.name === "report" ? "report" : "track")}</p>
              {reportsEnabled ? (
                <>
                  <Qr path={`/m/${muni.slug}/${view.name}?lang=${lang}`} size={320} label={t(lang, view.name === "report" ? "report" : "track")} />
                  <p className="text-[1.3rem] text-muted-foreground">{t(lang, view.name === "report" ? "scanReport" : "scanTrack")}</p>
                </>
              ) : <p className="mt-3 text-[1.4rem] text-muted-foreground">{t(lang, "unavailable")}</p>}
            </div>
          </div>
        )}
      </main>

      <footer className="flex shrink-0 items-center justify-between border-t pt-[1.4vh] text-[1.15rem] text-muted-foreground">
        <span>{view.name === "home" ? t(lang, "touchHint") : ""}</span>
        <span className="flex items-center gap-3">
          {t(lang, "poweredBy")}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aijur-logo.png" alt="AIJUR" className="h-12 w-auto" />
        </span>
      </footer>

      {warn !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)] anim-fade-in" onPointerDown={touch}>
          <div className="anim-rise w-[40%] rounded-3xl bg-background p-10 text-center shadow-[var(--shadow-modal)]">
            <p className="text-[2.2rem] font-bold">{t(lang, "idleTitle")}</p>
            <p className="mt-3 text-[1.5rem]">{t(lang, "idleBody")} {warn} {t(lang, "seconds")}</p>
            <div className="mt-6 flex justify-center"><Btn onClick={touch}>{t(lang, "idleStay")}</Btn></div>
          </div>
        </div>
      )}
    </div>
  );
}
