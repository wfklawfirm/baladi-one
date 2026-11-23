"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileSearch, Home, Languages, Lightbulb, QrCode, Search, Smartphone } from "lucide-react";
import { CATEGORIES, catLabel, pick, t } from "@/lib/i18n";
import { filterServices } from "@/lib/search";
import type { CategoryId, Lang, Municipality, Service } from "@/lib/types";
import { Qr } from "./Qr";
import { ServiceBody } from "./ServiceBody";

type View = { name: "home" } | { name: "list" } | { name: "service"; slug: string } | { name: "report" } | { name: "track" };

const WARN_SECONDS = 15;

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
  const goList = (q?: string) => { if (q !== undefined) setQuery(q); setView({ name: "list" }); };

  const Card = ({ icon, title, hint, onClick, disabled }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void; disabled?: boolean }) => (
    <button onClick={onClick} className="elev elev-hover flex h-full flex-col items-center justify-center gap-5 rounded-3xl border bg-background p-8 text-center transition active:scale-[0.98]">
      <span className="grid size-28 place-items-center rounded-full bg-accent text-primary">{icon}</span>
      <span className="text-[2.2rem] font-bold leading-tight">{title}</span>
      <span className="text-[1.4rem] text-muted-foreground">{hint}</span>
      <span className={`rounded-full bg-muted px-4 py-1 text-[1.1rem] text-muted-foreground ${disabled ? "" : "invisible"}`} aria-hidden={!disabled}>{t(lang, "unavailable")}</span>
    </button>
  );

  const Btn = ({ children, onClick, variant = "primary", disabled }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary"; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onClick}
      className={`inline-flex min-h-[4.5rem] items-center justify-center gap-3 rounded-2xl px-8 text-[1.5rem] font-bold transition active:scale-[0.98] disabled:opacity-60 ${variant === "primary" ? "bg-primary text-primary-foreground elev" : "border bg-background text-foreground hover:bg-muted"}`}>
      {children}
    </button>
  );

  return (
    <div dir={dir} lang={lang} className="flex h-dvh w-full select-none flex-col overflow-hidden bg-page px-[4vw] py-[2.2vh]">
      {/* top bar */}
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-4">
          {muni.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={muni.logoUrl} alt="" className="h-16 w-16 object-contain" />
            : <span className="grid size-16 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">B</span>}
          <div>
            <p className="text-[1.6rem] font-bold leading-tight">{lang === "en" && muni.nameEn ? muni.nameEn : muni.nameAr}</p>
            <p className="text-[1.05rem] text-muted-foreground">BALADI ONE</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {demo && <span className="rounded-full bg-accent px-5 py-2 text-[1.1rem] font-semibold text-accent-foreground">{t(lang, "demoBadge")}</span>}
          {view.name !== "home" && <Btn variant="secondary" onClick={reset}><Home className="size-6" />{t(lang, "home")}</Btn>}
          <Btn variant="secondary" onClick={() => setLang(lang === "ar" ? "en" : "ar")}><Languages className="size-6" />{t(lang, "language")}</Btn>
        </div>
      </header>

      {/* body */}
      <main className="min-h-0 flex-1 py-[1.5vh]">
        {view.name === "home" && (
          <div className="flex h-full flex-col">
            <h1 className="mt-[1vh] text-center text-[3.4rem] font-bold leading-tight">{t(lang, "heroTitle")}</h1>
            <form className="mx-auto mt-[2.5vh] flex w-full max-w-[62%] items-center gap-3 rounded-3xl border bg-background px-6 elev"
              onSubmit={(e) => { e.preventDefault(); goList(query); }}>
              <Search className="size-8 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(lang, "searchPlaceholder")}
                className="h-20 flex-1 bg-transparent text-[1.7rem] outline-none placeholder:text-muted-foreground" enterKeyHint="search" />
              <button type="submit" className="min-h-14 rounded-xl bg-primary px-6 text-[1.3rem] font-bold text-primary-foreground">{t(lang, "open")}</button>
            </form>
            <div className="mt-[3vh] grid min-h-0 flex-1 grid-cols-3 gap-[2vw]">
              <Card icon={<FileSearch className="size-14" />} title={t(lang, "transactions")} hint={t(lang, "transactionsHint")} onClick={() => goList("")} />
              <Card icon={<Lightbulb className="size-14" />} title={t(lang, "report")} hint={t(lang, "reportHint")} onClick={() => setView({ name: "report" })} disabled={!reportsEnabled} />
              <Card icon={<QrCode className="size-14" />} title={t(lang, "track")} hint={t(lang, "trackHint")} onClick={() => setView({ name: "track" })} disabled={!reportsEnabled} />
            </div>
          </div>
        )}

        {view.name === "list" && (
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-center gap-3 rounded-3xl border bg-background px-6 elev">
              <Search className="size-7 text-muted-foreground" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(lang, "searchPlaceholder")}
                className="h-16 flex-1 bg-transparent text-[1.5rem] outline-none placeholder:text-muted-foreground" />
            </div>
            <div className="flex flex-wrap gap-3">
              {(["all", ...CATEGORIES] as const).map((c) => (
                <button key={c} onClick={() => setCat(c)}
                  className={`min-h-14 rounded-2xl border px-6 text-[1.2rem] font-semibold ${cat === c ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                  {c === "all" ? t(lang, "all") : catLabel(lang, c)}
                </button>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto pb-2">
              {services.length === 0 && <p className="col-span-2 py-16 text-center text-[1.6rem] text-muted-foreground">{t(lang, "noCatalog")}</p>}
              {services.length > 0 && results.length === 0 && <p className="col-span-2 py-16 text-center text-[1.6rem] text-muted-foreground">{t(lang, "noResults")}</p>}
              {results.map((s) => (
                <button key={s.slug} onClick={() => setView({ name: "service", slug: s.slug })}
                  className="elev elev-hover flex min-h-28 flex-col items-start gap-1 rounded-2xl border bg-background p-5 text-start transition active:scale-[0.99]">
                  <span className="text-[1.5rem] font-bold">{pick(lang, s.title)}</span>
                  <span className="text-[1.1rem] text-primary">{catLabel(lang, s.category)}</span>
                  <span className="line-clamp-2 text-[1.15rem] text-muted-foreground">{pick(lang, s.summary)}</span>
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
                {service.demo && <p className="mt-2 rounded-xl bg-accent px-4 py-2 text-[1.1rem] text-accent-foreground">{t(lang, "draftNote")}</p>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-2"><ServiceBody s={service} lang={lang} scale="kiosk" /></div>
            </div>
            <aside className="flex w-[27%] shrink-0 flex-col items-center gap-4 rounded-3xl border bg-background p-6 elev">
              <Smartphone className="size-10 text-primary" />
              <Qr path={`/s/${muni.slug}/${service.slug}?lang=${lang}`} size={300} label={t(lang, "continueOnPhone")} />
              <p className="text-center text-[1.3rem] font-semibold">{t(lang, "continueOnPhone")}</p>
              <p className="text-center text-[1.05rem] text-muted-foreground">{t(lang, "scanQr")}</p>
              {service.onlineEnabled && reportsEnabled
                ? <Btn>{t(lang, "startOnline")}</Btn>
                : <p className="rounded-xl bg-muted p-3 text-center text-[1.05rem] text-muted-foreground">{t(lang, "notOnline")}</p>}
              <Btn variant="secondary" onClick={() => setView({ name: "list" })}><ArrowRight className={`size-6 ${dir === "ltr" ? "rotate-180" : ""}`} />{t(lang, "back")}</Btn>
            </aside>
          </div>
        )}

        {(view.name === "report" || view.name === "track") && (
          <div className="grid h-full place-items-center">
            <div className="max-w-3xl rounded-3xl border bg-background p-10 text-center elev">
              <p className="text-[2rem] font-bold">{t(lang, view.name === "report" ? "report" : "track")}</p>
              <p className="mt-3 text-[1.4rem] text-muted-foreground">{t(lang, "unavailable")}</p>
            </div>
          </div>
        )}
      </main>

      <footer className="flex shrink-0 items-center justify-between text-[1.05rem] text-muted-foreground">
        <span>{t(lang, "touchHint")}</span><span>{t(lang, "poweredBy")}</span>
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
