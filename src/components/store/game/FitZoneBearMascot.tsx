"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useLang } from "@/lib/language";

export type MascotState =
  | "idle_chubby"
  | "spinning_excited"
  | "reward_happy"
  | "workout_transition"
  | "fit_success";

type Props = {
  state: MascotState;
  reducedMotion?: boolean;
  size?: "sm" | "md" | "lg";
};

// ── Speech bubble text per state ────────────────────────────────────────────
const SPEECH_AR: Record<MascotState, string> = {
  idle_chubby:        "جاهزة نبدأ تحدي الهدايا؟ 🎁",
  spinning_excited:   "يلاااا! العجلة بتلف! 🎰",
  reward_happy:       "مبروك! قربتي من الهدية! 🎉",
  workout_transition: "كل خطوة بتقربك للمكافأة! 💪",
  fit_success:        "بطلة! هدايا المتجر اتفتحت! 🏆",
};

const SPEECH_EN: Record<MascotState, string> = {
  idle_chubby:        "Ready to start the gift challenge? 🎁",
  spinning_excited:   "Let's go! The wheel is spinning! 🎰",
  reward_happy:       "Congrats! Getting closer to your gift! 🎉",
  workout_transition: "Every step gets you closer to the reward! 💪",
  fit_success:        "Champion! Store gifts are unlocked! 🏆",
};

// ── Animatable bear params ────────────────────────────────────────────────────
interface BearP {
  belly:     number;   // 1.0 = max chubby, 0.15 = fit
  bodyW:     number;   // 1.0 = wide, 0.72 = slim
  shoulderW: number;   // 1.0 = normal, 1.2 = muscular
  armL:      number;   // left  arm angle (rad) positive = down
  armR:      number;   // right arm angle (rad) negative = down
  mouth:     number;   // 0 = neutral, 1 = wide smile
  cheek:     number;   // blush opacity
  glow:      number;   // background glow alpha
  dumbbell:  boolean;
  trophy:    boolean;
}

const TARGETS: Record<MascotState, BearP> = {
  idle_chubby:        { belly:1.00, bodyW:1.00, shoulderW:1.00, armL: 0.28,armR:-0.28, mouth:0.30, cheek:0.30, glow:0.00, dumbbell:false, trophy:false },
  spinning_excited:   { belly:0.90, bodyW:1.00, shoulderW:1.00, armL:-1.15,armR: 1.15, mouth:0.80, cheek:0.60, glow:0.18, dumbbell:false, trophy:false },
  reward_happy:       { belly:0.85, bodyW:0.97, shoulderW:1.05, armL:-0.90,armR: 0.65, mouth:1.00, cheek:0.90, glow:0.40, dumbbell:false, trophy:false },
  workout_transition: { belly:0.50, bodyW:0.85, shoulderW:1.10, armL:-0.55,armR: 0.55, mouth:0.60, cheek:0.40, glow:0.12, dumbbell:true,  trophy:false },
  fit_success:        { belly:0.18, bodyW:0.72, shoulderW:1.20, armL:-1.35,armR:-0.75, mouth:1.00, cheek:0.85, glow:0.60, dumbbell:false, trophy:true  },
};

// ── Helper ───────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.min(Math.max(t, 0), 1); }

// ── Colors ───────────────────────────────────────────────────────────────────
const BR = "#7B4F2E", BM = "#A06030", BL = "#C8895A";
const CR = "#F4D0A0", NS = "#2C1608";
const BAND = "#E91E63";
const GOLD = "#FBBF24";

// ── Draw helpers ─────────────────────────────────────────────────────────────
function fillEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2); ctx.fill();
}
function arc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0.1), 0, Math.PI * 2); ctx.fill();
}

function drawDumbbell(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.rotate(-0.4);
  // bar
  ctx.fillStyle = "#777";
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-14,-2.5,28,5,2); else ctx.rect(-14,-2.5,28,5); ctx.fill();
  // weights
  for (const wx of [-18, 10]) {
    ctx.fillStyle = "#999";
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(wx,-6,8,12,2); else ctx.rect(wx,-6,8,12); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(wx,-6,8,4,2); else ctx.rect(wx,-6,8,4); ctx.fill();
  }
  ctx.restore();
}

function drawTrophy(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.scale(0.78, 0.78);
  const tg = ctx.createLinearGradient(-10,-16,10,12);
  tg.addColorStop(0, "#FFE566"); tg.addColorStop(0.5, GOLD); tg.addColorStop(1, "#D97706");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-10,-16); ctx.bezierCurveTo(-16,-8,-16,2,-8,9);
  ctx.lineTo(-5,12); ctx.lineTo(5,12); ctx.lineTo(8,9);
  ctx.bezierCurveTo(16,2,16,-8,10,-16); ctx.closePath(); ctx.fill();
  for (const s of [-1,1]) {
    ctx.beginPath(); ctx.arc(s*15,-6,6,Math.PI*0.5,Math.PI*1.5,s===-1); ctx.lineWidth=4; ctx.strokeStyle=GOLD; ctx.stroke();
  }
  ctx.fillStyle = "#D97706";
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-6,12,12,5,2); else ctx.rect(-6,12,12,5); ctx.fill();
  ctx.font = "bold 9px serif"; ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.fillText("★",0,-3);
  ctx.restore();
}

// ── Main draw ─────────────────────────────────────────────────────────────────
function drawBear(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  p: BearP,
  anim: {
    bounceY: number; jumpY: number; blinkT: number;
    headTilt: number; armSwing: number; sweatT: number;
    sparkles: { x: number; y: number; r: number; a: number }[];
  },
  state: MascotState
) {
  // Internal space: 200 × 280. Scale uniformly to canvas.
  const IW = 200, IH = 280;
  const s  = Math.min(W / IW, H / IH);
  const ox = (W - IW * s) / 2, oy = (H - IH * s) / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);

  const CX = 100;
  const BY = anim.bounceY + anim.jumpY;

  // ① Glow
  if (p.glow > 0.02) {
    const gg = ctx.createRadialGradient(CX, 145, 8, CX, 145, 110);
    gg.addColorStop(0, `rgba(251,191,36,${p.glow * 0.55})`);
    gg.addColorStop(0.5, `rgba(233,30,99,${p.glow * 0.28})`);
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg; fillEllipse(ctx, CX, 145, 108, 120);
  }

  // ② Ground shadow
  ctx.save(); ctx.globalAlpha = 0.28;
  fillEllipse(ctx, CX, 262 + BY, 52 * p.bodyW, 9);
  ctx.restore();

  // ③ Legs
  const bodyW = 70 * p.bodyW, bodyY = 182 + BY;
  for (const side of [-1, 1]) {
    const lx = CX + side * 21;
    ctx.save();
    ctx.translate(lx, 240 + BY);
    // thigh
    const lg = ctx.createLinearGradient(-10, 0, 10, 0);
    lg.addColorStop(0, side < 0 ? BL : BM); lg.addColorStop(1, side < 0 ? BM : BL);
    ctx.fillStyle = lg;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-12,-16,24,34,10); else ctx.rect(-12,-16,24,34); ctx.fill();
    // paw
    ctx.fillStyle = BM; fillEllipse(ctx, 0, 22, 13, 9);
    ctx.fillStyle = "rgba(0,0,0,0.12)"; fillEllipse(ctx, 0, 22, 13, 9);
    ctx.restore();
  }

  // ④ Body
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  ctx.beginPath(); ctx.ellipse(CX, bodyY, bodyW, 64, 0, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(CX - 18, bodyY - 22, 4, CX, bodyY, bodyW + 8);
  bg.addColorStop(0, BL); bg.addColorStop(0.55, BM); bg.addColorStop(1, BR);
  ctx.fillStyle = bg; ctx.fill();
  ctx.restore();

  // ⑤ Belly
  if (p.belly > 0.04) {
    const bRX = 40 * p.belly, bRY = 32 * p.belly;
    const cg = ctx.createRadialGradient(CX - 4, bodyY - 2, 3, CX, bodyY + 10, bRX + 5);
    cg.addColorStop(0, "#FFF4E0"); cg.addColorStop(1, CR);
    ctx.fillStyle = cg; fillEllipse(ctx, CX, bodyY + 10, bRX, bRY);
    // belly highlight
    ctx.fillStyle = "rgba(255,255,255,0.1)"; fillEllipse(ctx, CX - 5, bodyY + 2, bRX * 0.42, bRY * 0.35);
  }

  // ⑥ Body highlight
  ctx.fillStyle = "rgba(255,255,255,0.08)"; fillEllipse(ctx, CX - 16, bodyY - 20, bodyW * 0.38, 28);

  // ⑦ Arms
  const shW = p.shoulderW;
  const shoulderXL = CX - bodyW * 0.78 * shW;
  const shoulderXR = CX + bodyW * 0.78 * shW;
  const shoulderY  = bodyY - 16;
  const swing = state === "spinning_excited" ? Math.sin(anim.armSwing * 5) * 0.14 : 0;

  for (const [side, pivX, baseAngle] of [
    [-1, shoulderXL, p.armL + swing] as const,
    [ 1, shoulderXR, p.armR - swing] as const,
  ]) {
    ctx.save();
    ctx.translate(pivX, shoulderY);
    ctx.rotate(baseAngle);

    const ag = ctx.createLinearGradient(0, 0, 0, 38);
    ag.addColorStop(0, BL); ag.addColorStop(1, BR);
    ctx.fillStyle = ag;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-9,-4,18,40,8); else ctx.rect(-9,-4,18,40); ctx.fill();

    ctx.save();
    ctx.translate(0, 36);
    ctx.rotate(side * 0.22);
    ctx.fillStyle = BM;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-7,0,14,32,6); else ctx.rect(-7,0,14,32); ctx.fill();
    // paw
    ctx.fillStyle = BR; fillEllipse(ctx, 0, 36, 10, 8);
    // accessories
    if (p.dumbbell && side === 1) { ctx.translate(2, 42); drawDumbbell(ctx); }
    if (p.trophy   && side === 1) { ctx.translate(0, 38); drawTrophy(ctx); }
    ctx.restore();
    ctx.restore();
  }

  // ⑧ Head
  const headCX = CX, headCY = bodyY - 64 * 0.85 - 4 + BY * 0.7;
  const headR   = 52;

  ctx.save();
  ctx.translate(headCX, headCY);
  ctx.rotate(anim.headTilt);

  // Ears
  for (const side of [-1, 1]) {
    const ex = side * 37, ey = -31;
    const eg = ctx.createRadialGradient(ex - 3, ey - 4, 2, ex, ey, 19);
    eg.addColorStop(0, BL); eg.addColorStop(1, BR);
    ctx.fillStyle = eg; arc(ctx, ex, ey, 19);
    ctx.fillStyle = "#C8796A"; arc(ctx, ex, ey, 10);
  }

  // Head shadow + fill
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.2)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  ctx.beginPath(); ctx.arc(0, 0, headR, 0, Math.PI * 2);
  const hg = ctx.createRadialGradient(-15, -19, 3, 0, 0, headR);
  hg.addColorStop(0, BL); hg.addColorStop(0.55, BM); hg.addColorStop(1, BR);
  ctx.fillStyle = hg; ctx.fill();
  ctx.restore();

  // Muzzle
  ctx.beginPath(); ctx.ellipse(0, 17, 25, 19, 0, 0, Math.PI * 2);
  const mg = ctx.createRadialGradient(-2, 12, 2, 0, 17, 25);
  mg.addColorStop(0, "#FFF4E4"); mg.addColorStop(1, CR);
  ctx.fillStyle = mg; ctx.fill();

  // Nose
  ctx.fillStyle = NS; fillEllipse(ctx, 0, 10, 9, 6);
  ctx.fillStyle = "rgba(255,255,255,0.28)"; fillEllipse(ctx, -2.5, 8, 3, 1.8);

  // Mouth
  ctx.beginPath();
  ctx.moveTo(-12, 23); ctx.quadraticCurveTo(0, 23 + 11 * p.mouth, 12, 23);
  ctx.strokeStyle = NS; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.stroke();
  if (p.mouth > 0.8) { ctx.fillStyle = "#E87A90"; fillEllipse(ctx, 0, 24.5, 5, 3.5); }

  // Eyes
  for (const [ex, ey] of [[-18, -4], [18, -4]] as const) {
    const eyeRY = Math.max(9 * (1 - anim.blinkT * 0.96), 0.4);
    ctx.fillStyle = "#FFF"; fillEllipse(ctx, ex, ey, 9, eyeRY);
    if (anim.blinkT < 0.72) {
      ctx.fillStyle = NS; arc(ctx, ex + 1.5, ey, 5);
      ctx.fillStyle = "rgba(255,255,255,0.85)"; arc(ctx, ex - 0.5, ey - 2.5, 2);
    }
    // Eyelid
    if (anim.blinkT > 0.03) {
      ctx.save();
      ctx.beginPath(); ctx.rect(ex - 11, ey - 12, 22, 12 + anim.blinkT * 9);
      ctx.clip();
      ctx.fillStyle = BM; arc(ctx, ex, ey, 9);
      ctx.restore();
    }
  }

  // Cheeks
  if (p.cheek > 0.03) {
    ctx.save(); ctx.globalAlpha = p.cheek * 0.55;
    for (const side of [-1, 1]) {
      const cg2 = ctx.createRadialGradient(side * 29, 14, 0, side * 29, 14, 12);
      cg2.addColorStop(0, "#FF8FAB"); cg2.addColorStop(1, "rgba(255,143,171,0)");
      ctx.fillStyle = cg2; arc(ctx, side * 29, 14, 12);
    }
    ctx.restore();
  }

  // Sweatband (always shown)
  ctx.beginPath(); ctx.arc(0, 0, headR, Math.PI * 0.8, Math.PI * 0.2, true);
  ctx.lineWidth = 8; ctx.strokeStyle = BAND; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, headR, Math.PI * 0.8, Math.PI * 0.2, true);
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.38)"; ctx.stroke();

  // Head highlight
  ctx.fillStyle = "rgba(255,255,255,0.1)"; fillEllipse(ctx, -17, -22, 14, 12);

  // Sweat drops (spinning state)
  if (state === "spinning_excited") {
    const swPhase = anim.sweatT;
    for (const [sx, sy, ph] of [[34,-14,0],[30,-28,0.38],[42,-22,0.75]] as const) {
      const alpha = Math.max(0, Math.sin(swPhase * 3 + ph * Math.PI)) * 0.8;
      const dy = sy - (swPhase % 1) * 14;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = "#90C8FF"; fillEllipse(ctx, sx, dy, 3, 5);
      ctx.restore();
    }
  }

  ctx.restore(); // end head

  // ⑨ Sparkles (reward / success)
  if (p.glow > 0.15) {
    for (const sp of anim.sparkles) {
      ctx.save(); ctx.globalAlpha = sp.a;
      ctx.fillStyle = sp.a > 0.5 ? "#FFF" : GOLD;
      arc(ctx, sp.x, sp.y, sp.r);
      ctx.restore();
    }
  }

  ctx.restore(); // end scale
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FitZoneBearMascot({ state, reducedMotion = false, size = "md" }: Props) {
  const { lang } = useLang();
  const SPEECH = lang === "ar" ? SPEECH_AR : SPEECH_EN;
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const rmRef      = useRef(reducedMotion);
  const stateRef   = useRef<MascotState>(state);

  // Live bear params (lerped toward target each frame)
  const pRef = useRef<BearP>({ ...TARGETS.idle_chubby });

  // Anim state
  const animRef = useRef({
    t:         0,    // time seconds
    bounceY:   0,
    jumpY:     0,
    blinkT:    0,
    headTilt:  0,
    armSwing:  0,
    sweatT:    0,
    nextBlink: 4 + Math.random() * 2,
    blinking:  false,
    sparkles:  [] as { x:number; y:number; r:number; a:number; vx:number; vy:number }[],
    jumpStart: -999,
    prevState: "idle_chubby" as MascotState,
  });

  // Keep refs in sync
  useEffect(() => { stateRef.current  = state;        }, [state]);
  useEffect(() => { rmRef.current     = reducedMotion; }, [reducedMotion]);

  const setSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    c.width  = w * dpr;
    c.height = h * dpr;
  }, []);

  useLayoutEffect(() => { setSize(); }, [setSize]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const obs = new ResizeObserver(setSize);
    obs.observe(c);
    return () => obs.disconnect();
  }, [setSize]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const c    = canvasRef.current;
      if (!c) return;
      const ctx  = c.getContext("2d");
      if (!ctx) return;

      const s    = stateRef.current;
      const tgt  = TARGETS[s];
      const p    = pRef.current;
      const an   = animRef.current;
      const rm   = rmRef.current;
      const lsp  = rm ? 0.15 : 0.045;   // lerp speed

      an.t += dt;

      // ── Lerp body toward target ──────────────────────────
      p.belly     = lerp(p.belly,     tgt.belly,     lsp);
      p.bodyW     = lerp(p.bodyW,     tgt.bodyW,     lsp);
      p.shoulderW = lerp(p.shoulderW, tgt.shoulderW, lsp);
      p.armL      = lerp(p.armL,      tgt.armL,      lsp);
      p.armR      = lerp(p.armR,      tgt.armR,      lsp);
      p.mouth     = lerp(p.mouth,     tgt.mouth,     lsp);
      p.cheek     = lerp(p.cheek,     tgt.cheek,     lsp * 0.8);
      p.glow      = lerp(p.glow,      tgt.glow,      lsp);
      p.dumbbell  = tgt.dumbbell;
      p.trophy    = tgt.trophy;

      // ── Idle oscillations ────────────────────────────────
      if (!rm) {
        an.bounceY  = Math.sin(an.t * 1.4) * (s === "idle_chubby" ? 2.8 : 1.6);
        an.headTilt = Math.sin(an.t * 0.9) * 0.04;
        an.armSwing = an.t;
        if (s === "spinning_excited") {
          an.sweatT += dt;
          an.jumpY   = Math.abs(Math.sin(an.t * 6)) * -7;
        } else {
          an.sweatT = 0;
          an.jumpY  = lerp(an.jumpY, 0, 0.1);
        }
      } else {
        an.bounceY = 0; an.headTilt = 0; an.jumpY = 0;
      }

      // ── Blink ──────────────────────────────────────────────
      if (!rm) {
        if (!an.blinking && an.t >= an.nextBlink) {
          an.blinking  = true;
        }
        if (an.blinking) {
          an.blinkT += dt * 7;
          if (an.blinkT >= 2) {
            an.blinkT    = 0;
            an.blinking  = false;
            an.nextBlink = an.t + 3.5 + Math.random() * 2.5;
          }
        } else {
          an.blinkT = 0;
        }
      } else {
        an.blinkT = 0;
      }

      // ── Sparkles ───────────────────────────────────────────
      if (!rm && (s === "reward_happy" || s === "fit_success")) {
        if (Math.random() < 0.18) {
          an.sparkles.push({
            x: 30 + Math.random() * 140,
            y: 20 + Math.random() * 200,
            r: 2 + Math.random() * 3,
            a: 0.9,
            vx: (Math.random() - 0.5) * 20,
            vy: -20 - Math.random() * 30,
          });
        }
        an.sparkles = an.sparkles
          .map(sp => ({ ...sp, x: sp.x + sp.vx * dt, y: sp.y + sp.vy * dt, a: sp.a - dt * 0.9 }))
          .filter(sp => sp.a > 0);
      } else {
        an.sparkles = [];
      }

      const blinkClamped = Math.min(Math.max(an.blinkT < 1 ? an.blinkT : 2 - an.blinkT, 0), 1);

      drawBear(ctx, c.width, c.height, p, {
        bounceY:  an.bounceY,
        jumpY:    an.jumpY,
        blinkT:   blinkClamped,
        headTilt: an.headTilt,
        armSwing: an.armSwing,
        sweatT:   an.sweatT,
        sparkles: an.sparkles,
      }, s);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const pxSize = size === "sm" ? 110 : size === "lg" ? 210 : 160;
  const pxH    = Math.round(pxSize * 1.38);
  const speechVisible = true;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, userSelect: "none" }}>
      {/* Speech bubble */}
      <div
        key={state}  // re-mount on state change to trigger fade-in
        style={{
          background: "rgba(255,255,255,0.95)",
          color: "#1a0010",
          fontSize: size === "sm" ? 10 : 12,
          fontWeight: 800,
          fontFamily: "Cairo,Tajawal,sans-serif",
          padding: size === "sm" ? "5px 9px" : "7px 12px",
          borderRadius: 12,
          maxWidth: pxSize + 20,
          textAlign: "center",
          lineHeight: 1.5,
          boxShadow: "0 3px 12px rgba(0,0,0,0.3)",
          animation: "bear-speech-in 0.4s ease both",
          position: "relative",
        }}
      >
        {SPEECH[state]}
        {/* Triangle pointing down to bear */}
        <div style={{
          position: "absolute",
          bottom: -7, left: "50%",
          transform: "translateX(-50%)",
          width: 0, height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "7px solid rgba(255,255,255,0.95)",
        }} />
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: pxSize, height: pxH, display: "block" }}
      />

      <style>{`
        @keyframes bear-speech-in {
          from { opacity:0; transform:translateY(-6px) scale(0.92); }
          to   { opacity:1; transform:translateY(0)    scale(1);    }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="bear-speech-in"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
