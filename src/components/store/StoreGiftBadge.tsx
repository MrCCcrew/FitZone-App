"use client";

const CSS = `
@keyframes sgb-badge-pulse {
  0%,100%{box-shadow:0 0 0 0 rgba(233,30,99,.45)}
  60%{box-shadow:0 0 0 5px rgba(233,30,99,0)}
}
@media (prefers-reduced-motion:reduce){
  .sgb-badge{animation:none!important}
}
`;

type Props = {
  /** campaign is active — if false renders nothing */
  active: boolean;
};

export function StoreGiftBadge({ active }: Props) {
  if (!active) return null;
  return (
    <>
      <style>{CSS}</style>
      <div
        className="sgb-badge"
        aria-label="هذا المنتج يساعدك على فتح هدية المتجر"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          background: "linear-gradient(135deg,#be123c,#e91e63)",
          color: "#fff",
          fontSize: 10,
          fontWeight: 800,
          padding: "3px 8px",
          borderRadius: 99,
          boxShadow: "0 2px 8px rgba(233,30,99,.35)",
          animation: "sgb-badge-pulse 2s ease-out infinite",
          letterSpacing: ".2px",
          whiteSpace: "nowrap",
        }}
      >
        🎁 <span>للهدية</span>
      </div>
    </>
  );
}
