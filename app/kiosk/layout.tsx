/** Kiosk root scale: 1rem = 16px at 1920x1080 and 32px at 3840x2160; scales by the smaller of width/height so the whole page always fits — so rem-based sizes scale with the screen. */
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html{font-size:clamp(9px,min(0.8334vw,1.4815vh),40px)} body{overflow:hidden;overscroll-behavior:none;user-select:none} header[data-site-nav]{display:none!important}`}</style>
      {children}
    </>
  );
}
