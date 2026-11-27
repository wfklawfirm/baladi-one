import { LOGO_SRC, TRIAL_URL } from "@/lib/brand-motion";
import { AIJURQrCode } from "./AIJURQrCode";

/** Official AIJUR logo (unmodified) with the QR codes directly below (trial + site), centred on white. Animation is applied by the parent stage via CSS only. */
export function AIJURBrandMotion({ priority = false, showQr = true }: { priority?: boolean; showQr?: boolean }) {
  return (
    <div className="brand-stack">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_SRC} alt="" width={700} height={638} className="brand-logo" draggable={false} decoding="sync" {...(priority ? { fetchPriority: "high" as const } : {})} />
      {showQr && (
        <div className="brand-qr-row">
          <figure className="brand-qr-wrap brand-qr-main"><AIJURQrCode url={TRIAL_URL} label="trial" /><figcaption dir="rtl">جرّب منصة بلدي الذكية<small>امسح الرمز بكاميرا هاتفك</small></figcaption></figure>
          <figure className="brand-qr-wrap brand-qr-side"><AIJURQrCode /><figcaption dir="ltr">www.aijur.ai</figcaption></figure>
        </div>
      )}
    </div>
  );
}
