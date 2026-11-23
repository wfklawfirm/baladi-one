import type { Metadata, Viewport } from "next";
import { Manrope, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap",
});

export const metadata: Metadata = {
  title: "BALADI ONE — المعاملات البلدية",
  description: "منصة المعاملات والخدمات البلدية",
  robots: { index: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${manrope.variable} ${arabic.variable}`}>
      <body className="min-h-dvh antialiased"><SiteNav />{children}</body>
    </html>
  );
}
