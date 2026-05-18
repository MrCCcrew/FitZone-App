"use client";
import { useEffect, useRef, useState } from "react";

const CSS = `
@keyframes sgb-float {
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(-5px)}
}
@keyframes sgb-shake {
  0%,100%{transform:rotate(0) translateY(0)}
  10%{transform:rotate(-4deg) translateY(-3px)}
  20%{transform:rotate(4deg) translateY(-5px)}
  30%{transform:rotate(-3deg) translateY(-3px)}
  40%{transform:rotate(3deg) translateY(-1px)}
  50%{transform:rotate(0) translateY(0)}
}
@keyframes sgb-lid-open {
  0%{transform:perspective(120px) rotateX(0deg) translateY(0)}
  60%{transform:perspective(120px) rotateX(-140deg) translateY(-6px)}
  100%{transform:perspective(120px) rotateX(-140deg) translateY(-6px)}
}
@keyframes sgb-sparkle {
  0%,100%{opacity:0;transform:scale(0) rotate(0deg)}
  40%{opacity:1;transform:scale(1) rotate(30deg)}
  70%{opacity:.7;transform:scale(.8) rotate(60deg)}
}
@keyframes sgb-confetti {
  0%{transform:translateY(0) rotate(0deg) scaleX(1);opacity:1}
  100%{transform:translateY(100px) rotate(540deg) scaleX(-1);opacity:0}
}
@keyframes sgb-glow-ring {
  0%,100%{opacity:0}
  50%{opacity:.7}
}
@keyframes sgb-claim-pop {
  0%{transform:scale(0);opacity:0}
  70%{transform:scale(1.15)}
  100%{transform:scale(1);opacity:1}
}
@media (prefers-reduced-motion:reduce){
  .sgb-animated{animation:none!important;transition:none!important}
}
`;

const CONFETTI_COLORS = ["#e91e63","#f43f5e","#c2185b","#ff8fb5","#f59e0b","#fbbf24","#22c55e"];

type Props = {
  pct: number;
  alreadyClaimed?: boolean;
  size?: number;
};

export function StoreGiftBoxAnimation({ pct, alreadyClaimed = false, size = 80 }: Props) {
  const unlocked = pct >= 100;
  const [opened, setOpened] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [reduced, setReduced] = useState(false);
  const didOpen = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion:reduce)");
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (!unlocked || alreadyClaimed || didOpen.current) return;
    const key = "sgb-confetti-shown";
    const already = sessionStorage.getItem(key) === "1";
    didOpen.current = true;
    setOpened(true);
    if (!already && !reduced) {
      setShowConfetti(true);
      sessionStorage.setItem(key, "1");
      const t = setTimeout(() => setShowConfetti(false), 2800);
      return () => clearTimeout(t);
    }
  }, [unlocked, alreadyClaimed, reduced]);

  const confetti = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: 8 + (i * 5.5) % 84,
    delay: (i * 0.12) % 1.4,
    dur: 1.1 + (i % 4) * 0.25,
    w: 5 + (i % 3) * 2,
    h: 3 + (i % 2),
  }));

  const floatAnim = !unlocked && !reduced ? "sgb-float 3s ease-in-out infinite" : "none";
  const shakeAnim = !unlocked && !reduced && pct > 0
    ? "sgb-shake 4s ease-in-out 2s infinite"
    : "none";

  return (
    <>
      <style>{CSS}</style>
      <div
        role="img"
        aria-label={alreadyClaimed ? "تم استلام الهدية" : unlocked ? "تم فتح هدية المتجر" : "صندوق هدية مغلق"}
        style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      >
        {/* Confetti */}
        {showConfetti && confetti.map(c => (
          <div
            key={c.id}
            className="sgb-animated"
            style={{
              position: "absolute",
              left: `${c.left}%`,
              top: "20%",
              width: c.w,
              height: c.h,
              background: c.color,
              borderRadius: 2,
              animation: `sgb-confetti ${c.dur}s ease-in ${c.delay}s forwards`,
              zIndex: 20,
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Glow ring behind box when unlocked */}
        {unlocked && !alreadyClaimed && (
          <div style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(233,30,99,.25) 0%, transparent 70%)",
            animation: !reduced ? "sgb-glow-ring 1.8s ease-in-out infinite" : "none",
            pointerEvents: "none",
          }} />
        )}

        {/* Box container with float + shake */}
        <div
          className="sgb-animated"
          style={{ width: size, height: size, animation: `${floatAnim}, ${shakeAnim}` }}
        >
          <svg viewBox="0 0 80 80" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sgb-body" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#9f1239" />
              </linearGradient>
              <linearGradient id="sgb-lid" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#e11d48" />
              </linearGradient>
              <linearGradient id="sgb-shine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff" stopOpacity=".22" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <filter id="sgb-shadow">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#9f1239" floodOpacity=".4" />
              </filter>
            </defs>

            {/* Box body */}
            <rect x="8" y="44" width="64" height="30" rx="6" fill="url(#sgb-body)" filter="url(#sgb-shadow)" />
            <rect x="8" y="44" width="64" height="30" rx="6" fill="url(#sgb-shine)" />
            {/* Body ribbon vertical */}
            <rect x="35" y="44" width="10" height="30" fill="#fb7185" opacity=".5" rx="1" />
            {/* Body ribbon horizontal */}
            <rect x="8" y="55" width="64" height="9" fill="#fb7185" opacity=".35" />

            {/* Lid group — animates open */}
            <g
              className="sgb-animated"
              style={{
                transformBox: "fill-box",
                transformOrigin: "top center",
                animation: opened && !reduced ? "sgb-lid-open .85s cubic-bezier(.4,0,.2,1) .1s both" : "none",
              }}
            >
              <rect x="5" y="28" width="70" height="18" rx="5" fill="url(#sgb-lid)" />
              <rect x="5" y="28" width="70" height="18" rx="5" fill="url(#sgb-shine)" />
              {/* Lid ribbon */}
              <rect x="35" y="28" width="10" height="18" fill="#fda4af" opacity=".55" rx="1" />
              {/* Bow left loop */}
              <path d="M36 33 Q24 18 26 33 Q30 28 36 33Z" fill="#fda4af" opacity=".9" />
              {/* Bow right loop */}
              <path d="M44 33 Q56 18 54 33 Q50 28 44 33Z" fill="#fda4af" opacity=".9" />
              {/* Bow knot */}
              <ellipse cx="40" cy="33" rx="4.5" ry="3.5" fill="#fff" opacity=".35" />
              <ellipse cx="40" cy="33" rx="2.5" ry="2" fill="#fda4af" opacity=".7" />
            </g>

            {/* Sparkles when locked & progress > 0 */}
            {!unlocked && !alreadyClaimed && pct > 0 && (
              <>
                <circle cx="67" cy="20" r="2.5" fill="#fbbf24"
                  style={{ animation: !reduced ? "sgb-sparkle 2.4s ease-in-out .4s infinite" : "none" }} />
                <circle cx="13" cy="26" r="1.8" fill="#fbbf24"
                  style={{ animation: !reduced ? "sgb-sparkle 2.4s ease-in-out 1.1s infinite" : "none" }} />
                <circle cx="62" cy="64" r="2" fill="#fb7185"
                  style={{ animation: !reduced ? "sgb-sparkle 2.4s ease-in-out 1.7s infinite" : "none" }} />
              </>
            )}

            {/* Claimed overlay */}
            {alreadyClaimed && (
              <g style={{ animation: !reduced ? "sgb-claim-pop .5s ease-out both" : "none" }}>
                <circle cx="58" cy="60" r="13" fill="#16a34a" />
                <circle cx="58" cy="60" r="13" fill="url(#sgb-shine)" />
                <path d="M51 60 L56 65 L65 53" stroke="#fff" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

            {/* Open gift glow */}
            {unlocked && !alreadyClaimed && opened && (
              <ellipse cx="40" cy="44" rx="18" ry="4"
                fill="#f43f5e" opacity=".3"
                style={{ animation: !reduced ? "sgb-glow-ring 1.4s ease-in-out infinite" : "none" }} />
            )}
          </svg>
        </div>
      </div>
    </>
  );
}
