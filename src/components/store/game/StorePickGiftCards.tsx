"use client";
import { useState } from "react";

const CSS = `
@keyframes spgc-flip {
  0%{transform:perspective(600px) rotateY(0deg)}
  100%{transform:perspective(600px) rotateY(180deg)}
}
@keyframes spgc-hover {
  0%,100%{transform:translateY(0) rotateZ(-1deg)}
  50%{transform:translateY(-6px) rotateZ(1deg)}
}
@keyframes spgc-shimmer {
  0%{background-position:-200% center}
  100%{background-position:200% center}
}
@media(prefers-reduced-motion:reduce){
  .spgc-card-inner{transition:none!important;animation:none!important}
  .spgc-card-hover{animation:none!important}
}
`;

const CARD_COLORS = ["#7c3aed","#be185d","#0369a1"];
const REWARD_ICONS: Record<string, string> = {
  wallet: "💳", points: "⭐", discount: "🏷️",
  free_shipping: "🚚", free_product: "🎁", bonus_chest: "📦",
};

type CardState = { index: number; revealed: boolean; labelAr?: string; type?: string };

type Props = {
  cards: CardState[];
  maxPicks: number;
  picksDone: number;
  onPick: (index: number) => Promise<void>;
};

export function StorePickGiftCards({ cards, maxPicks, picksDone, onPick }: Props) {
  const [picking, setPicking] = useState<number | null>(null);
  const canPick = picksDone < maxPicks;
  const totalCards = Math.max(3, cards.length);

  const handle = async (idx: number) => {
    if (!canPick || picking !== null || cards[idx]?.revealed) return;
    setPicking(idx);
    await onPick(idx).catch(() => {});
    setPicking(null);
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", marginBottom: 8, fontFamily: "Cairo,Tajawal,sans-serif" }}>
          🃏 اختاري كارت واحد
        </h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginBottom: 32, fontFamily: "Cairo,Tajawal,sans-serif" }}>
          {canPick ? "اضغطي على كارت لتكشفي مكافأتك" : "تم اختيار الكارت — تقدمي للخطوة التالية"}
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          {Array.from({ length: totalCards }, (_, i) => {
            const card = cards[i];
            const isFlipped = card?.revealed;
            const isLoading = picking === i;
            const color = CARD_COLORS[i % CARD_COLORS.length];
            return (
              <div
                key={i}
                onClick={() => void handle(i)}
                style={{
                  width: 100, height: 150,
                  perspective: 600,
                  cursor: isFlipped || !canPick || isLoading ? "default" : "pointer",
                  flexShrink: 0,
                }}
              >
                <div
                  className="spgc-card-inner"
                  style={{
                    width: "100%", height: "100%",
                    position: "relative",
                    transformStyle: "preserve-3d",
                    transition: "transform .65s cubic-bezier(.4,0,.2,1)",
                    transform: isFlipped ? "perspective(600px) rotateY(180deg)" : "perspective(600px) rotateY(0deg)",
                    animation: !isFlipped && canPick && !isLoading
                      ? `spgc-hover ${2.5 + i * 0.4}s ease-in-out ${i * 0.2}s infinite` : "none",
                  }}
                >
                  {/* Front — mystery */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 16,
                    backfaceVisibility: "hidden",
                    background: `linear-gradient(145deg,${color},#1a0020)`,
                    border: "1.5px solid rgba(255,255,255,.15)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,.4)",
                    overflow: "hidden",
                  }}>
                    {/* Shimmer */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,.08) 50%,transparent 100%)",
                      backgroundSize: "200% auto",
                      animation: "spgc-shimmer 2s linear infinite",
                    }} />
                    <div style={{ fontSize: 36, zIndex: 1 }}>❓</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", fontWeight: 700, fontFamily: "Cairo,Tajawal,sans-serif", zIndex: 1 }}>
                      {isLoading ? "..." : "اكشفي"}
                    </div>
                    {/* Corner stars */}
                    <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, opacity: .5 }}>✨</div>
                    <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10, opacity: .5 }}>✨</div>
                  </div>
                  {/* Back — reward */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 16,
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: "linear-gradient(145deg,#10b981,#065f46)",
                    border: "1.5px solid rgba(16,185,129,.4)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 6,
                    boxShadow: "0 8px 24px rgba(16,185,129,.3)",
                    padding: 8,
                  }}>
                    <div style={{ fontSize: 30 }}>{REWARD_ICONS[card?.type ?? ""] ?? "🎁"}</div>
                    <div style={{ fontSize: 11, color: "#fff", fontWeight: 800, textAlign: "center", fontFamily: "Cairo,Tajawal,sans-serif", lineHeight: 1.4 }}>
                      {card?.labelAr ?? ""}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
