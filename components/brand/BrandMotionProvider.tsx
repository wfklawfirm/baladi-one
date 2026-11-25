"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_DISPLAY, SCREENSAVER_EVENT, normalizeIdle, type DisplaySettings } from "@/lib/brand-motion";
import { useIdleDetection } from "@/lib/useIdleDetection";
import { IdleScreensaver } from "./IdleScreensaver";

/** Screensaver for public screens only (never staff areas, never in place of any session lock). Settings come from /api/display (defaults 60 s). */
export function BrandMotionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/display").then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setSettings({ enabled: j.enabled !== false, idleSeconds: normalizeIdle(j.idleSeconds), qr: j.qr !== false }); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const isPublic = !pathname.startsWith("/staff") && !pathname.startsWith("/api");
  const enabled = settings.enabled && isPublic && !open;
  const onIdle = useCallback(() => {
    // Display screens, laptops and tablets only: a phone reader should not get a screensaver.
    if (Math.min(window.innerWidth, window.innerHeight) < 600) return;
    setOpen(true);
    window.dispatchEvent(new CustomEvent(SCREENSAVER_EVENT)); // kiosk clears the previous visitor's session
  }, []);
  useIdleDetection({ timeoutMs: settings.idleSeconds * 1000, enabled, onIdle });
  const dismiss = useCallback(() => setOpen(false), []);
  useEffect(() => { if (!isPublic) setOpen(false); }, [isPublic]);

  return <>{children}<IdleScreensaver open={open} onDismiss={dismiss} showQr={settings.qr} /></>;
}
