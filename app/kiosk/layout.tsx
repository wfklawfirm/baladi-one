/** Kiosk root scale: 1rem = 16px at 1920 wide, 32px at 3840 wide (4K) — so rem-based sizes scale with the screen. */
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html{font-size:clamp(14px,0.8334vw,40px)} body{overflow:hidden;overscroll-behavior:none;user-select:none}`}</style>
      {children}
    </>
  );
}
