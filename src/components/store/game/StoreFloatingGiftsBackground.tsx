"use client";

const CSS = `
@keyframes sfg-float {
  0%,100%{transform:translateY(0) rotate(0deg)}
  33%{transform:translateY(-18px) rotate(6deg)}
  66%{transform:translateY(-8px) rotate(-4deg)}
}
@media(prefers-reduced-motion:reduce){.sfg-item{animation:none!important}}
`;

const ITEMS = ["🎁","🎀","✨","🎊","🎉","⭐","🏆","💫"];

export function StoreFloatingGiftsBackground() {
  const positions = [
    { left: "5%", top: "10%", dur: 6, delay: 0, size: 28 },
    { left: "90%", top: "15%", dur: 7, delay: 1, size: 22 },
    { left: "15%", top: "75%", dur: 8, delay: 0.5, size: 24 },
    { left: "85%", top: "70%", dur: 6.5, delay: 1.5, size: 20 },
    { left: "50%", top: "5%", dur: 7.5, delay: 0.8, size: 26 },
    { left: "75%", top: "45%", dur: 9, delay: 2, size: 18 },
    { left: "25%", top: "45%", dur: 8.5, delay: 1.2, size: 20 },
    { left: "60%", top: "85%", dur: 6, delay: 0.3, size: 22 },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {positions.map((p, i) => (
          <div
            key={i}
            className="sfg-item"
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              fontSize: p.size,
              opacity: 0.12,
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
