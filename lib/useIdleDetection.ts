"use client";
import { useEffect, useRef } from "react";

/** Calls onIdle after `timeoutMs` without pointer/touch/keyboard/wheel/scroll activity. Passive listeners, throttled re-arming. */
export function useIdleDetection({ timeoutMs, enabled, onIdle }: { timeoutMs: number; enabled: boolean; onIdle: () => void }) {
  const cb = useRef(onIdle);
  useEffect(() => { cb.current = onIdle; }, [onIdle]);
  useEffect(() => {
    if (!enabled) return;
    let timer = 0, lastArm = 0;
    const arm = () => { window.clearTimeout(timer); lastArm = Date.now(); timer = window.setTimeout(() => { if (document.visibilityState === "visible") cb.current(); else arm(); }, timeoutMs); };
    const onActivity = () => { if (Date.now() - lastArm > 250) arm(); };
    const ev = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"] as const;
    ev.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    arm();
    return () => { window.clearTimeout(timer); ev.forEach((e) => window.removeEventListener(e, onActivity, { capture: true })); };
  }, [timeoutMs, enabled]);
}
