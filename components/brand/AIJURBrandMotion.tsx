import { LOGO_SRC } from "@/lib/brand-motion";
import { AIJURQrCode } from "./AIJURQrCode";

/** Official AIJUR logo (unmodified) with the QR directly below, centred on white. Animation is applied by the parent stage via CSS only. */
export function AIJURBrandMotion({ priority = false, showQr = true }: { priority?: boolean; showQr?: boolean }) {
  return (
    <div className="brand-stack">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_SRC} alt="" width={700} height={638} className="brand-logo" draggable={false} decoding="sync" {...(priority ? { fetchPriority: "high" as const } : {})} />
      {showQr && <div className="brand-qr-wrap"><AIJURQrCode /></div>}
    </div>
  );
}
