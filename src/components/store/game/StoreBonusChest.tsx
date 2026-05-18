"use client";
import { useEffect, useState } from "react";

const CSS = `
@keyframes sbc-shake {
  0%,100%{transform:rotate(0deg) scale(1)}
  15%{transform:rotate(-8deg) scale(1.05)}
  30%{transform:rotate(8deg) scale(1.08)}
  45%{transform:rotate(-6deg) scale(1.06)}
  60%{transform:rotate(6deg) scale(1.04)}
  75%{transform:rotate(-3deg) scale(1.02)}
  90%{transform:rotate(3deg) scale(1.01)}
}
@keyframes sbc-lid-open {
  from{transform:rotateX(0deg);transform-origin:bottom center}
  to{transform:rotateX(-120deg);transform-origin:bottom center}
}
@keyframes sbc-sparkle {
  0%{opacity:0;transform:scale(0) translate(0,0)}
  50%{opacity:1}
  100%{opacity:0;transform:scale(1.5) translate(var(--tx),var(--ty))}
}
@keyframes sbc-glow {
  0%,100%{filter:drop-shadow(0 0 8px rgba(251,191,36,.4))}
  50%{filter:drop-shadow(0 0 24px rgba(251,191,36,.9))}
}
@media(prefers-reduced-motion:reduce){
  .sbc-chest{animation:none!important}
  .sbc-sparkle{animation:none!important}
}
`;

const SPARKLE_POSITIONS = [
  { tx: "-40px", ty: "-60px" }, { tx: "0px", ty: "-70px" }, { tx: "40px", ty: "-60px" },
  { tx: "-60px", ty: "-30px" }, { tx: "60px", ty: "-30px" }, { tx: "-50px", ty: "10px" },
  { tx: "50px", ty: "10px" }, { tx: "0px", ty: "-50px" },
];

type Props = { labelAr: string; onDone: () => void };

export function StoreBonusChest({ labelAr, onDone }: Props) {
  const [phase, setPhase] = useState<"shake" | "open" | "done">("shake");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("open"), 1800);
    const t2 = setTimeout(() => setPhase("done"), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginBottom: 24, fontFamily: "Cairo,Tajawal,sans-serif" }}>
          📦 عندك صندوق مكافآت إضافي!
        </p>

        {/* Chest wrapper */}
        <div style={{ position: "relative", display: "inline-block" }}>
          {/* Sparkles */}
          {phase === "open" && SPARKLE_POSITIONS.map((sp, i) => (
            <div
              key={i}
              className="sbc-sparkle"
              style={{
                position: "absolute",
                top: "40%", left: "50%",
                width: 10, height: 10,
                borderRadius: "50%",
                background: i % 2 === 0 ? "#fbbf24" : "#f97316",
                // @ts-expect-error CSS custom property
                "--tx": sp.tx, "--ty": sp.ty,
                animation: `sbc-sparkle .8s ease-out ${i * 0.08}s both`,
                pointerEvents: "none",
              }}
            />
          ))}

          {/* Chest emoji — big */}
          <div
            className="sbc-chest"
            style={{
              fontSize: 96,
              animation: phase === "shake"
                ? "sbc-shake .5s ease-in-out infinite, sbc-glow 1s ease-in-out infinite"
                : phase === "open"
                ? "sbc-glow .4s ease-in-out infinite"
                : "none",
              display: "inline-block",
              cursor: "default",
            }}
          >
            {phase === "open" || phase === "done" ? "📭" : "📦"}
          </div>
        </div>

        {/* Label */}
        {phase === "done" && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              display: "inline-block",
              background: "rgba(251,191,36,.12)",
              border: "1px solid rgba(251,191,36,.3)",
              borderRadius: 12,
              padding: "10px 24px",
              fontSize: 17,
              fontWeight: 900,
              color: "#fde68a",
              fontFamily: "Cairo,Tajawal,sans-serif",
              marginBottom: 20,
            }}>
              {labelAr}
            </div>
            <br />
            <button
              onClick={onDone}
              style={{
                padding: "12px 36px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#f59e0b,#f97316)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 900,
                cursor: "pointer",
                fontFamily: "Cairo,Tajawal,sans-serif",
                boxShadow: "0 4px 16px rgba(249,115,22,.4)",
              }}
            >
              تقدمي للأمام ←
            </button>
          </div>
        )}
      </div>
    </>
  );
}
