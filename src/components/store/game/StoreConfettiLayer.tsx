"use client";
import { useEffect, useState } from "react";

const COLORS = ["#e91e63","#f59e0b","#8b5cf6","#10b981","#f43f5e","#3b82f6","#f97316","#a855f7","#fbbf24"];

const CSS = `
@keyframes sgc-fall {
  0%{transform:translateY(-20px) rotate(0deg) scaleX(1);opacity:1}
  100%{transform:translateY(110vh) rotate(720deg) scaleX(-1);opacity:0}
}
@media(prefers-reduced-motion:reduce){.sgc-piece{animation:none!important;display:none}}
`;

export function StoreConfettiLayer({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<{ id: number; left: number; color: string; dur: number; delay: number; w: number; h: number }[]>([]);

  useEffect(() => {
    if (!active) return setPieces([]);
    setPieces(Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: COLORS[i % COLORS.length],
      dur: 2 + Math.random() * 1.5,
      delay: Math.random() * 1.2,
      w: 6 + Math.floor(Math.random() * 6),
      h: 4 + Math.floor(Math.random() * 3),
    })));
    const t = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(t);
  }, [active]);

  if (!pieces.length) return <style>{CSS}</style>;

  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
        {pieces.map(p => (
          <div
            key={p.id}
            className="sgc-piece"
            style={{
              position: "absolute",
              left: `${p.left}%`,
              top: "-10px",
              width: p.w,
              height: p.h,
              background: p.color,
              borderRadius: 2,
              animation: `sgc-fall ${p.dur}s ease-in ${p.delay}s forwards`,
            }}
          />
        ))}
      </div>
    </>
  );
}
