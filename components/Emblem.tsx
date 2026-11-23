import { BRAND } from "@/lib/brand";
/** Municipality emblem: the supplied logo, or a burgundy monogram until the logo file is provided. */
export default function Emblem({ size = 96 }: { size?: number }) {
  if (BRAND.logo) return <img src={BRAND.logo} alt={BRAND.nameAr} width={size} height={size} style={{ height: size, width: "auto", maxWidth: size * 2 }} className="object-contain" />;
  return <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.45 }} className="grid place-items-center rounded-full border-2 border-primary font-bold text-primary">خ</span>;
}
