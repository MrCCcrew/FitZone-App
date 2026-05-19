"use client";

const CSS = `
@keyframes sfg-float {
  0%,100%{transform:translateY(0) rotate(0deg)}
  33%{transform:translateY(-18px) rotate(6deg)}
  66%{transform:translateY(-8px) rotate(-4deg)}
}
@keyframes sfg-particle {
  0%   { transform: translateY(0)   scale(1);   opacity: 0.18; }
  50%  { transform: translateY(-28px) scale(1.15); opacity: 0.28; }
  100% { transform: translateY(0)   scale(1);   opacity: 0.18; }
}
@keyframes sfg-spotlight {
  0%,100% { opacity: 0.55; }
  50%     { opacity: 0.9; }
}
@media(prefers-reduced-motion:reduce){
  .sfg-item,.sfg-part { animation:none!important }
}
`;

const ITEMS  = ["🎁","💪","✨","🏋️","🎉","⭐","🏆","🎀"];
const PARTS  = ["✦","✧","⋆","✵","✦","·","✧","⋆","✵","·"];

export function StoreFloatingGiftsBackground() {
  const floats = [
    { left: "4%",  top: "8%",  dur: 6,   delay: 0,   size: 28 },
    { left: "90%", top: "12%", dur: 7,   delay: 1,   size: 22 },
    { left: "12%", top: "72%", dur: 8,   delay: 0.5, size: 24 },
    { left: "86%", top: "68%", dur: 6.5, delay: 1.5, size: 20 },
    { left: "50%", top: "4%",  dur: 7.5, delay: 0.8, size: 26 },
    { left: "76%", top: "44%", dur: 9,   delay: 2,   size: 18 },
    { left: "22%", top: "44%", dur: 8.5, delay: 1.2, size: 20 },
    { left: "60%", top: "84%", dur: 6,   delay: 0.3, size: 22 },
  ];

  const particles = [
    { left: "18%", top: "22%", dur: 5,   delay: 0.2 },
    { left: "72%", top: "18%", dur: 6.5, delay: 1.1 },
    { left: "38%", top: "60%", dur: 7,   delay: 0.6 },
    { left: "82%", top: "55%", dur: 5.5, delay: 1.8 },
    { left: "30%", top: "85%", dur: 6,   delay: 0.4 },
    { left: "55%", top: "30%", dur: 8,   delay: 2.2 },
    { left: "10%", top: "50%", dur: 7.5, delay: 0.9 },
    { left: "65%", top: "72%", dur: 5,   delay: 1.5 },
    { left: "44%", top: "14%", dur: 6.5, delay: 0.1 },
    { left: "92%", top: "38%", dur: 7,   delay: 2.8 },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>

        {/* Radial spotlight centre */}
        <div style={{
          position: "absolute",
          top: "10%", left: "50%",
          transform: "translateX(-50%)",
          width: "70%",
          paddingTop: "70%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(233,30,99,0.12) 0%, rgba(139,92,246,0.07) 50%, transparent 75%)",
          animation: "sfg-spotlight 4s ease-in-out infinite",
        }} />

        {/* CSS-only particles (stars/dots) */}
        {particles.map((p, i) => (
          <div
            key={`p${i}`}
            className="sfg-part"
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              fontSize: 12 + (i % 3) * 4,
              color: i % 2 === 0 ? "rgba(251,191,36,0.45)" : "rgba(233,30,99,0.3)",
              animation: `sfg-particle ${p.dur}s ease-in-out ${p.delay}s infinite`,
              userSelect: "none",
              fontWeight: 900,
            }}
          >
            {PARTS[i % PARTS.length]}
          </div>
        ))}

        {/* Floating emoji icons */}
        {floats.map((p, i) => (
          <div
            key={`f${i}`}
            className="sfg-item"
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              fontSize: p.size,
              opacity: 0.1,
              animation: `sfg-float ${p.dur}s ease-in-out ${p.delay}s infinite`,
              userSelect: "none",
            }}
          >
            {ITEMS[i % ITEMS.length]}
          </div>
        ))}
      </div>
    </>
  );
}
