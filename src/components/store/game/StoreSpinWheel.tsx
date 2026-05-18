"use client";
import { useRef, useState } from "react";

const CSS = `
@keyframes ssw-spin-idle {
  from{transform:rotate(0deg)}
  to{transform:rotate(360deg)}
}
@keyframes ssw-glow-ring {
  0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}
  50%{box-shadow:0 0 0 12px rgba(251,191,36,.25)}
}
@keyframes ssw-btn-pulse {
  0%,100%{transform:scale(1)}
  50%{transform:scale(1.05)}
}
@media(prefers-reduced-motion:reduce){
  .ssw-wheel-track{animation:none!important}
  .ssw-btn{animation:none!important}
}
`;

const SEG_COLORS = ["#e91e63","#f59e0b","#8b5cf6","#10b981","#f43f5e","#3b82f6","#f97316","#a855f7"];
const SEG_LIGHT  = ["#ff8fb5","#fde68a","#c4b5fd","#6ee7b7","#fda4af","#93c5fd","#fdba74","#d8b4fe"];

type WheelSegment = { id: string; labelAr: string; type: string };

function buildWheelPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

type Props = {
  segments: WheelSegment[];
  onSpin: () => Promise<{ slotIndex: number }>;
  disabled?: boolean;
};

export function StoreSpinWheel({ segments, onSpin, disabled }: Props) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const currentRot = useRef(0);
  const N = Math.max(4, Math.min(8, segments.length || 8));
  const seg = segments.slice(0, N);
  while (seg.length < N) seg.push(seg[seg.length % Math.max(1, segments.length)] ?? { id: "x", labelAr: "🎁", type: "free_product" });
  const cx = 150, cy = 150, r = 130;
  const degPerSeg = 360 / N;

  const handleSpin = async () => {
    if (spinning || disabled) return;
    setSpinning(true);
    try {
      const res = await onSpin();
      const winIdx = res.slotIndex % N;
      // Land so winning segment is at top (pointer at 270deg = -90deg from standard)
      const targetAngle = winIdx * degPerSeg;
      const cur = currentRot.current % 360;
      const diff = ((targetAngle - cur) % 360 + 360) % 360;
      const newRot = currentRot.current + 5 * 360 + diff;
      currentRot.current = newRot;
      setRotation(newRot);
      await new Promise(r => setTimeout(r, 4500));
    } finally {
      setSpinning(false);
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {/* Wheel container */}
        <div style={{ position: "relative", width: 300, height: 300 }}>
          {/* Glow ring */}
          <div className="ssw-wheel-track" style={{
            position: "absolute", inset: -4, borderRadius: "50%",
            background: "transparent",
            animation: !spinning ? "ssw-glow-ring 2s ease-in-out infinite" : "none",
          }} />
          {/* Wheel SVG */}
          <svg
            viewBox="0 0 300 300"
            width="300" height="300"
            style={{
              display: "block",
              borderRadius: "50%",
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? `transform 4s cubic-bezier(.17,.67,.12,1)` : "none",
              filter: "drop-shadow(0 8px 24px rgba(0,0,0,.4))",
            }}
          >
            {/* Outer ring */}
            <circle cx={cx} cy={cy} r={r + 6} fill="rgba(251,191,36,.15)" />
            <circle cx={cx} cy={cy} r={r + 3} fill="rgba(251,191,36,.25)" />
            {/* Segments */}
            {seg.map((s, i) => {
              const startDeg = i * degPerSeg - 90;
              const endDeg = (i + 1) * degPerSeg - 90;
              const midDeg = (startDeg + endDeg) / 2;
              const midRad = (midDeg * Math.PI) / 180;
              const lx = cx + (r * 0.62) * Math.cos(midRad);
              const ly = cy + (r * 0.62) * Math.sin(midRad);
              return (
                <g key={s.id + i}>
                  <path d={buildWheelPath(cx, cy, r, startDeg, endDeg)} fill={SEG_COLORS[i % SEG_COLORS.length]} />
                  {/* Divider line */}
                  <line
                    x1={cx} y1={cy}
                    x2={cx + r * Math.cos((startDeg * Math.PI) / 180)}
                    y2={cy + r * Math.sin((startDeg * Math.PI) / 180)}
                    stroke="rgba(255,255,255,.3)" strokeWidth="1.5"
                  />
                  {/* Label */}
                  <text
                    x={lx} y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize="11"
                    fontWeight="800"
                    fontFamily="Cairo,Tajawal,sans-serif"
                    transform={`rotate(${midDeg + 90},${lx},${ly})`}
                    style={{ pointerEvents: "none" }}
                  >
                    {s.labelAr.length > 8 ? s.labelAr.slice(0, 8) : s.labelAr}
                  </text>
                </g>
              );
            })}
            {/* Center circle */}
            <circle cx={cx} cy={cy} r={22} fill="#1a0020" stroke="rgba(251,191,36,.5)" strokeWidth="2" />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="20">🎰</text>
          </svg>
          {/* Pointer */}
          <div style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "14px solid transparent",
            borderRight: "14px solid transparent",
            borderTop: "28px solid #fbbf24",
            filter: "drop-shadow(0 2px 6px rgba(251,191,36,.8))",
            zIndex: 2,
          }} />
        </div>

        {/* Spin button */}
        <button
          onClick={() => void handleSpin()}
          disabled={spinning || disabled}
          className="ssw-btn"
          style={{
            padding: "14px 48px",
            borderRadius: 14,
            border: "none",
            background: spinning || disabled
              ? "rgba(255,255,255,.1)"
              : "linear-gradient(135deg,#e91e63,#c2185b)",
            color: spinning || disabled ? "rgba(255,255,255,.4)" : "#fff",
            fontSize: 18,
            fontWeight: 900,
            cursor: spinning || disabled ? "not-allowed" : "pointer",
            fontFamily: "Cairo,Tajawal,sans-serif",
            boxShadow: spinning || disabled ? "none" : "0 6px 24px rgba(233,30,99,.45)",
            animation: !spinning && !disabled ? "ssw-btn-pulse 2s ease-in-out infinite" : "none",
            transition: "all .25s",
          }}
        >
          {spinning ? "⏳ جارٍ اللفة..." : "🎰 ابدئي اللفة"}
        </button>
      </div>
    </>
  );
}
