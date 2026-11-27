/** Shared constants for the AIJUR brand motion (splash + screensaver). */
export const IDLE_CHOICES = [30, 60, 120, 300] as const;
export const DEFAULT_IDLE_SECONDS = 60;
export const SPLASH_MS = 1500;
export const SPLASH_FLAG = "aijur-splash";
export const SCREENSAVER_EVENT = "aijur:screensaver";
export const LOGO_SRC = "/aijur-logo.png";
export const QR_URL = "https://www.aijur.ai/";
/** Public trial landing (QR under the logo): the full public platform + the 3-day AI assistant trial. */
export const TRIAL_URL = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://baladi-one-pink.vercel.app"}/try`;
export type DisplaySettings = { enabled: boolean; idleSeconds: number; qr: boolean };
export const DEFAULT_DISPLAY: DisplaySettings = { enabled: true, idleSeconds: DEFAULT_IDLE_SECONDS, qr: true };
export const normalizeIdle = (v: unknown): number => (IDLE_CHOICES as readonly number[]).includes(Number(v)) ? Number(v) : DEFAULT_IDLE_SECONDS;
