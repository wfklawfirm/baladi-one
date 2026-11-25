"use client";
import { useState } from "react";
import { Play, Monitor } from "lucide-react";
import { AppSplashScreen } from "./AppSplashScreen";
import { IdleScreensaver } from "./IdleScreensaver";

/** Staff-side preview of both modes. The screensaver preview closes on any touch / key / mouse move, like the real one. */
export function BrandPreview() {
  const [splash, setSplash] = useState(0);
  const [saver, setSaver] = useState(false);
  const btn = "inline-flex min-h-12 items-center gap-2 rounded-xl border px-5 font-semibold active:bg-muted";
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" className={btn} onClick={() => setSplash((n) => n + 1)}><Play className="size-5" aria-hidden />معاينة شاشة الافتتاح</button>
      <button type="button" className={btn} onClick={() => setSaver(true)}><Monitor className="size-5" aria-hidden />معاينة شاشة الانتظار</button>
      {splash > 0 && <AppSplashScreen key={splash} preview onDone={() => setSplash(0)} />}
      <IdleScreensaver open={saver} onDismiss={() => setSaver(false)} />
    </div>
  );
}
