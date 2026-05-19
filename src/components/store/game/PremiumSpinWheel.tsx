"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLang } from "@/lib/language";

type WheelSegment = { id: string; labelAr: string; labelEn?: string; type: string; icon?: string };

type Props = {
  segments: WheelSegment[];
  onSpin: () => Promise<{ slotIndex: number }>;
  onSpinComplete?: () => void;
  disabled?: boolean;
};

const PALETTE: [string, string][] = [
  ["#ff2d78", "#8b0039"],
  ["#9333ea", "#4c1d95"],
  ["#0ea5e9", "#0c4a6e"],
  ["#f59e0b", "#78350f"],
  ["#10b981", "#064e3b"],
  ["#f97316", "#7c2d12"],
  ["#ec4899", "#831843"],
  ["#6366f1", "#312e81"],
];

const TYPE_ICON: Record<string, string> = {
  free_product: "🎁",
  bonus_chest: "💎",
  free_shipping: "🚚",
  points: "⭐",
  discount: "🪙",
  default: "🏆",
};

function easeOut4(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

export function PremiumSpinWheel({ segments, onSpin, onSpinComplete, disabled }: Props) {
  const { lang } = useLang();
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const rotRef       = useRef(0);
  const rmRef        = useRef(false);
  const [spinning, setSpinning] = useState(false);

  const N = Math.max(4, Math.min(8, segments.length || 6));
  const segs: WheelSegment[] = Array.from({ length: N }, (_, i) =>
    segments[i % Math.max(1, segments.length)] ??
    { id: `x${i}`, labelAr: "هدية", labelEn: "Gift", type: "free_product" }
  );

  useEffect(() => {
    rmRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // ── Draw ────────────────────────────────────────────────────────────────────
  const draw = useCallback((angleDeg: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R     = Math.min(cx, cy) * 0.91;
    const rimW  = R * 0.072;
    const innerR = R - rimW;

    ctx.clearRect(0, 0, W, H);

    // ① Outer radial glow (world space)
    const glow = ctx.createRadialGradient(cx, cy, innerR * 0.1, cx, cy, R * 1.55);
    glow.addColorStop(0,   "rgba(233,30,99,0.28)");
    glow.addColorStop(0.45,"rgba(139,92,246,0.14)");
    glow.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2);
    ctx.fill();

    // ② Drop shadow under wheel
    ctx.save();
    ctx.shadowColor   = "rgba(0,0,0,0.75)";
    ctx.shadowBlur    = 38;
    ctx.shadowOffsetY = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();

    // ③ Rotate context for spinning segments
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angleDeg * Math.PI) / 180);

    const radPerSeg = (2 * Math.PI) / N;

    // ④ Draw each segment
    for (let i = 0; i < N; i++) {
      const sa = i * radPerSeg - Math.PI / 2;
      const ea = sa + radPerSeg;
      const ma = sa + radPerSeg / 2;
      const [c1, c2] = PALETTE[i % PALETTE.length];

      // Gradient from center outward
      const gx1 = Math.cos(ma) * innerR * 0.12;
      const gy1 = Math.sin(ma) * innerR * 0.12;
      const gx2 = Math.cos(ma) * innerR;
      const gy2 = Math.sin(ma) * innerR;
      const sg = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
      sg.addColorStop(0, c1);
      sg.addColorStop(1, c2);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, innerR, sa, ea);
      ctx.closePath();
      ctx.fillStyle = sg;
      ctx.fill();

      // Rim-edge highlight arc
      ctx.beginPath();
      ctx.arc(0, 0, innerR - 1.5, sa + 0.045, ea - 0.045);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth   = 5;
      ctx.stroke();

      // Divider line
      ctx.beginPath();
      ctx.moveTo(Math.cos(sa) * 5, Math.sin(sa) * 5);
      ctx.lineTo(Math.cos(sa) * innerR, Math.sin(sa) * innerR);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Text & icon
      const tr  = innerR * 0.6;
      const tx  = Math.cos(ma) * tr;
      const ty  = Math.sin(ma) * tr;

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ma + Math.PI / 2);

      const iconSz = Math.max(14, innerR * 0.105);
      ctx.font          = `${iconSz}px serif`;
      ctx.textAlign     = "center";
      ctx.textBaseline  = "middle";
      const segIcon = segs[i].icon || TYPE_ICON[segs[i].type] || TYPE_ICON.default;
      ctx.fillText(segIcon, 0, -iconSz * 0.88);

      const labelSz = Math.max(9, innerR * 0.073);
      ctx.font         = `900 ${labelSz}px Cairo,Tajawal,sans-serif`;
      ctx.fillStyle    = "#fff";
      ctx.shadowColor  = "rgba(0,0,0,0.95)";
      ctx.shadowBlur   = 4;
      const rawFull = lang === "en" && segs[i].labelEn ? segs[i].labelEn! : segs[i].labelAr;
      const label   = rawFull.length > 9 ? rawFull.slice(0, 9) : rawFull;
      ctx.fillText(label, 0, iconSz * 0.76);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ⑤ Gold metallic rim (4 layered strokes)
    const rimColors = ["#fef3c7", "#fbbf24", "#f59e0b", "#d97706"] as const;
    const rimAlphas = [1, 0.75, 0.5, 0.3] as const;
    for (let l = 0; l < 4; l++) {
      ctx.beginPath();
      ctx.arc(0, 0, R - l * (rimW / 4), 0, Math.PI * 2);
      ctx.strokeStyle  = rimColors[l];
      ctx.globalAlpha  = rimAlphas[l];
      ctx.lineWidth    = rimW / 4 + 0.5;
      ctx.stroke();
      ctx.globalAlpha  = 1;
    }

    ctx.restore(); // end rotation

    // ⑥ Lamp dots (fixed, world space)
    const lampCount = N * 3;
    for (let i = 0; i < lampCount; i++) {
      const a   = (i / lampCount) * Math.PI * 2;
      const lr  = R + rimW * 0.08;
      const lx  = cx + Math.cos(a) * lr;
      const ly  = cy + Math.sin(a) * lr;
      const on  = (i + Math.floor(angleDeg / 14)) % 2 === 0;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, rimW * 0.36, 0, Math.PI * 2);
      if (on) {
        ctx.shadowColor = "#fbbf24";
        ctx.shadowBlur  = 9;
        ctx.fillStyle   = "#fef9c3";
      } else {
        ctx.fillStyle = "rgba(251,191,36,0.22)";
      }
      ctx.fill();
      ctx.restore();
    }

    // ⑦ Vignette
    const vig = ctx.createRadialGradient(cx, cy, innerR * 0.42, cx, cy, innerR);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.24)");
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = vig;
    ctx.fill();

    // ⑧ Center cap (fixed, always upright)
    const capR = innerR * 0.122;
    ctx.save();
    ctx.shadowColor   = "rgba(0,0,0,0.8)";
    ctx.shadowBlur    = 12;
    ctx.shadowOffsetY = 4;
    const capG = ctx.createRadialGradient(
      cx - capR * 0.3, cy - capR * 0.3, 0,
      cx, cy, capR
    );
    capG.addColorStop(0,   "#fff9e7");
    capG.addColorStop(0.4, "#fbbf24");
    capG.addColorStop(1,   "#78350f");
    ctx.beginPath();
    ctx.arc(cx, cy, capR, 0, Math.PI * 2);
    ctx.fillStyle = capG;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, capR, 0, Math.PI * 2);
    ctx.strokeStyle = "#fef3c7";
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    const capFsz = Math.max(8, capR * 0.5);
    ctx.font          = `900 ${capFsz}px Cairo,Tajawal,sans-serif`;
    ctx.fillStyle     = "#1a000a";
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillText("GO", cx, cy);

  }, [segs, N, lang]);

  // ── Canvas sizing ────────────────────────────────────────────────────────────
  const setSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const s   = c.clientWidth;
    if (s === 0) return;
    c.width  = s * dpr;
    c.height = s * dpr;
    draw(rotRef.current);
  }, [draw]);

  useLayoutEffect(() => { setSize(); }, [setSize]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const obs = new ResizeObserver(setSize);
    obs.observe(c);
    return () => obs.disconnect();
  }, [setSize]);

  // ── Spin ─────────────────────────────────────────────────────────────────────
  const handleSpin = async () => {
    if (spinning || disabled) return;
    setSpinning(true);

    let winIdx = 0;
    try {
      const res = await onSpin();
      winIdx = ((res.slotIndex ?? 0) % N + N) % N;
    } catch {
      setSpinning(false);
      return;
    }

    const degPerSeg = 360 / N;
    const start     = rotRef.current;

    // Compute rotation so pointer (at top, 0° wheel-local) lands on winIdx
    // After rotation R, top points to wheel-local angle (360 - R%360)%360
    // We want that = winIdx * degPerSeg
    // => R = (N - winIdx) * degPerSeg + n*360
    const desired  = ((N - winIdx) * degPerSeg) % 360;
    const curMod   = ((start % 360) + 360) % 360;
    const diff     = ((desired - curMod) + 360) % 360;
    const spins    = rmRef.current ? 1 : 7;
    const target   = start + spins * 360 + diff;
    const duration = rmRef.current ? 900 : 7000;
    const t0       = performance.now();

    const animate = (now: number) => {
      const prog  = Math.min((now - t0) / duration, 1);
      const angle = start + (target - start) * easeOut4(prog);
      rotRef.current = angle;
      draw(angle);

      if (prog < 1) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      rotRef.current = target;
      if (rmRef.current) {
        draw(target);
        setSpinning(false);
        onSpinComplete?.();
        return;
      }

      // Bounce animation
      const bT0  = performance.now();
      const bDur = 600;
      const bMag = degPerSeg * 0.055;
      const bounce = (bnow: number) => {
        const bt = Math.min((bnow - bT0) / bDur, 1);
        draw(target + Math.sin(bt * Math.PI * 2.5) * bMag * (1 - bt));
        if (bt < 1) rafRef.current = requestAnimationFrame(bounce);
        else { draw(target); setSpinning(false); onSpinComplete?.(); }
      };
      rafRef.current = requestAnimationFrame(bounce);
    };

    rafRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <>
      <style>{`
        @keyframes psw-enter {
          from { transform: scale(0.82); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        @keyframes psw-spotlight {
          0%,100% { opacity: 0.55; transform: scale(0.96); }
          50%     { opacity: 1;    transform: scale(1.06); }
        }
        @keyframes psw-btn-idle {
          0%,100% { box-shadow: 0 8px 32px rgba(233,30,99,0.5), inset 0 1px 0 rgba(255,255,255,0.22); }
          50%     { box-shadow: 0 12px 44px rgba(233,30,99,0.75), inset 0 1px 0 rgba(255,255,255,0.22); }
        }
        @media (prefers-reduced-motion: reduce) {
          .psw-wrap  { animation: none !important; }
          .psw-spot  { animation: none !important; }
          .psw-btn-active { animation: none !important; }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "4px 0 8px" }}>

        {/* Wheel + pointer */}
        <div
          className="psw-wrap"
          style={{
            position: "relative",
            width: "min(88vw, 460px)",
            maxWidth: 460,
            animation: "psw-enter 0.65s cubic-bezier(.34,1.5,.64,1) both",
          }}
        >
          {/* Spotlight glow */}
          <div
            className="psw-spot"
            style={{
              position: "absolute",
              inset: "-22%",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(233,30,99,0.2) 0%, rgba(139,92,246,0.1) 40%, transparent 72%)",
              pointerEvents: "none",
              animation: "psw-spotlight 3.2s ease-in-out infinite",
            }}
          />

          {/* Pointer */}
          <div style={{
            position: "absolute",
            top: -10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            lineHeight: 0,
            filter: "drop-shadow(0 0 10px #fbbf24) drop-shadow(0 2px 5px rgba(0,0,0,0.8))",
          }}>
            <svg width="38" height="30" viewBox="0 0 38 30">
              <defs>
                <linearGradient id="psw-pg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#fff9c4"/>
                  <stop offset="50%"  stopColor="#fbbf24"/>
                  <stop offset="100%" stopColor="#d97706"/>
                </linearGradient>
              </defs>
              <polygon points="19,29 1,1 37,1" fill="url(#psw-pg)"/>
              <polygon points="19,23 7,5  31,5"  fill="rgba(255,255,255,0.28)"/>
            </svg>
          </div>

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            style={{ width: "100%", aspectRatio: "1", display: "block", borderRadius: "50%" }}
          />
        </div>

        {/* Spin button */}
        <button
          onClick={() => { void handleSpin(); }}
          disabled={spinning || !!disabled}
          className={!spinning && !disabled ? "psw-btn-active" : ""}
          style={{
            padding: "15px 56px",
            borderRadius: 18,
            border: "1.5px solid rgba(255,255,255,0.2)",
            background: spinning || disabled
              ? "rgba(255,255,255,0.07)"
              : "linear-gradient(135deg, #f97316 0%, #e91e63 60%, #c2185b 100%)",
            color: spinning || disabled ? "rgba(255,255,255,0.3)" : "#fff",
            fontSize: 19,
            fontWeight: 900,
            cursor: spinning || disabled ? "not-allowed" : "pointer",
            fontFamily: "Cairo,Tajawal,sans-serif",
            transition: "transform 0.2s, background 0.25s",
            animation: !spinning && !disabled ? "psw-btn-idle 2.4s ease-in-out infinite" : "none",
            letterSpacing: "0.3px",
          }}
          onMouseEnter={e => { if (!spinning && !disabled) (e.currentTarget as HTMLElement).style.transform = "scale(1.05)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          {spinning
            ? (lang === "ar" ? "⏳ جارٍ اللفة..." : "⏳ Spinning...")
            : (lang === "ar" ? "🎰 لفّي العجلة" : "🎰 Spin the Wheel")}
        </button>
      </div>
    </>
  );
}
