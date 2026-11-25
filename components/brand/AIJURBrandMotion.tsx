import { LOGO_SRC } from "@/lib/brand-motion";

/** The official AIJUR logo, unmodified, centred on white. Animation is applied by the parent stage (CSS only, GPU transform/opacity). */
export function AIJURBrandMotion({ priority = false }: { priority?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOGO_SRC} alt="" width={700} height={638} className="brand-logo" draggable={false} decoding="sync" {...(priority ? { fetchPriority: "high" as const } : {})} />;
}
