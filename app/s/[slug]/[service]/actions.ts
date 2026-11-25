"use server";
import { portalServices } from "@/lib/portal";
import { pick, t } from "@/lib/i18n";
import { reportsEnabled, submitServiceRequest } from "@/lib/reports";
import type { Lang } from "@/lib/types";

export type RegisterResult = { ok: true; code: string; title: string } | { ok: false; error: string };

/** Registers an initial request for a transaction. The service title is taken from the catalog on the server, never from the browser. */
export async function registerRequest(
  slug: string, serviceSlug: string, channel: "kiosk" | "app", lang: Lang,
  input: { name: string; phone: string; note: string; website?: string },
): Promise<RegisterResult> {
  if (!reportsEnabled()) return { ok: false, error: t(lang, "regSoon") };
  if (input.website) return { ok: false, error: t(lang, "errGeneric") }; // honeypot
  if (channel !== "kiosk" && channel !== "app") return { ok: false, error: t(lang, "errGeneric") };
  const name = String(input.name ?? "").trim(), phone = String(input.phone ?? "").trim(), note = String(input.note ?? "").trim().slice(0, 1000);
  if (name.length < 2 || name.length > 120) return { ok: false, error: t(lang, "errName") };
  if (!/^[0-9+ ()-]{6,20}$/.test(phone)) return { ok: false, error: t(lang, "errPhone") };
  const svc = (await portalServices()).find((s) => s.slug === serviceSlug);
  if (!svc) return { ok: false, error: t(lang, "errGeneric") };
  const title = pick("ar", svc.title);
  const r = await submitServiceRequest(slug, { serviceSlug, serviceTitle: title, name, phone, note, channel });
  if (r.ok) return { ok: true, code: r.code, title: pick(lang, svc.title) };
  return { ok: false, error: r.error === "rate_limited" ? t(lang, "errRate") : r.error === "invalid_name" ? t(lang, "errName") : r.error === "invalid_phone" ? t(lang, "errPhone") : t(lang, "errGeneric") };
}
