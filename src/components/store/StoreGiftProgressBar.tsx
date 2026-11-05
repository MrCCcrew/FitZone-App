"use client";
import { useEffect, useRef, useState } from "react";

const CSS = `
@keyframes sgb-shimmer {
  0%{background-position:-200% center}
  100%{background-position:200% center}
}
@keyframes sgb-progress-glow {
  0%,100%{box-shadow:0 0 0 rgba(233,30,99,0)}
  50%{box-shadow:0 0 14px rgba(233,30,99,.6),0 0 28px rgba(233,30,99,.25)}
}
@keyframes sgb-check-draw {
  from{stroke-dashoffset:28}
  to{stroke-dashoffset:0}
}
@keyframes sgb-check-circle {
  from{transform:scale(0);opacity:0}
  to{transform:scale(1);opacity:1}
}
@keyframes sgb-milestone-pop {
  0%{transform:scaleX(1)}
  40%{transform:scaleX(1.02)}
  100%{transform:scaleX(1)}
}
@media (prefers-reduced-motion:reduce){
  .sgb-pb-shimmer{animation:none!important}
  .sgb-pb-fill{transition:none!important}
}
`;

type Props = {
  current: number;
  target: number;
  rewardLabel: string;
  height?: number;
};

export function StoreGiftProgressBar({ current, target, rewardLabel, height = 10 }: Props) {
  const pct = Math.min(100, Math.round((current / Math.max(1, target)) * 100));
  const remaining = Math.max(0, target - current);
  const unlocked = pct >= 100;
  const [displayPct, setDisplayPct] = useState(0);
  const raf = useRef<number>(0);

  // Animate progress pct on mount / change
  useEffect(() => {
    const start = displayPct;
    const end = pct;
    if (start === end) return;
    const dur = 600;
    const t0 = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - elapsed, 3);
      setDisplayPct(Math.round(start + (end - start) * ease));
      if (elapsed < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const fmt = (v: number) =>
    v.toLocaleString("ar-EG") + " ج.م";

  return (
    <>
      <style>{CSS}</style>
      <div>
        {/* Labels */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: unlocked ? "#22c55e" : "#e91e63" }}>
            {unlocked ? "✅ وصلتِ للهدف!" : `وصلتِ لـ ${fmt(current)}`}
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            {fmt(target)}
          </span>
        </div>

        {/* Track */}
        <div
          role="progressbar"
          aria-label="تقدم حملة الهدية"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayPct}
          style={{
            height,
            borderRadius: 99,
            background: "rgba(0,0,0,.08)",
            overflow: "hidden",
            position: "relative",
            border: unlocked ? "1px solid rgba(34,197,94,.3)" : "1px solid rgba(233,30,99,.12)",
            animation: unlocked ? "sgb-progress-glow 1.8s ease-in-out infinite" : "none",
          }}
        >
          {/* Fill */}
          <div
            className="sgb-pb-fill"
            style={{
              height: "100%",
              width: `${displayPct}%`,
              borderRadius: 99,
              background: unlocked
                ? "linear-gradient(90deg,#16a34a,#22c55e,#4ade80)"
                : "linear-gradient(90deg,#be123c,#e91e63,#fb7185,#e91e63,#be123c)",
              backgroundSize: "200% auto",
              transition: "width .05s linear",
              position: "relative",
              animation: unlocked ? "none" : "sgb-shimmer 2.2s linear infinite",
            }}
          >
            {/* Shimmer overlay */}
            {!unlocked && (
              <div
                className="sgb-pb-shimmer"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,.35) 50%,transparent 100%)",
                  backgroundSize: "200% auto",
                  animation: "sgb-shimmer 1.6s linear infinite",
                  borderRadius: "inherit",
                }}
              />
            )}
          </div>

          {/* Milestone dots */}
          {[25, 50, 75].map(m => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: `${m}%`,
                top: "50%",
                transform: "translate(-50%,-50%)",
                width: 4,
                height: height + 2,
                background: displayPct >= m ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.06)",
                borderRadius: 2,
              }}
            />
          ))}
        </div>

        {/* Bottom text */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 7 }}>
          {unlocked ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle
                  cx="10" cy="10" r="9"
                  fill="#22c55e"
                  style={{ animation: "sgb-check-circle .4s ease-out both" }}
                />
                <path
                  d="M6 10 L9 13 L14 7"
                  stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="28" strokeDashoffset="0"
                  style={{ animation: "sgb-check-draw .4s ease-out .25s both" }}
                />
              </svg>
              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>
                الهدية اتفتحت — {rewardLabel} سيُضاف تلقائياً
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              باقي <span style={{ color: "#e91e63", fontWeight: 700 }}>{fmt(remaining)}</span> وتفتحي هدية المتجر
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 800, color: unlocked ? "#22c55e" : "#e91e63" }}>
            {displayPct}%
          </span>
        </div>
      </div>
    </>
  );
}
