"use client";
import { useEffect, useState } from "react";
import { SPLASH_FLAG, SPLASH_MS } from "@/lib/brand-motion";
import { AIJURBrandMotion } from "./AIJURBrandMotion";

/** First-open splash: server-rendered (no load delay — the app renders underneath), animated by CSS, shown once per browser session.
 *  The inline script in the layout adds `splash-done` to <html> when the session flag exists, so a repeat visit never flashes it. */
export function AppSplashScreen({ preview = false, onDone }: { preview?: boolean; onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!preview) { try { sessionStorage.setItem(SPLASH_FLAG, "1"); } catch { /* private mode: splash may repeat, harmless */ } }
    const id = window.setTimeout(() => { setGone(true); onDone?.(); }, SPLASH_MS);
    return () => window.clearTimeout(id);
  }, [preview, onDone]);
  if (gone) return null;
  return <div className="brand-stage splash" aria-hidden="true"><AIJURBrandMotion priority /></div>;
}
