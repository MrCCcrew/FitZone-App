"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/language";

const CSS = `
@keyframes spgc-hover {
  0%,100%{transform:translateY(0) rotateZ(-1deg)}
  50%{transform:translateY(-7px) rotateZ(1deg)}
}
@keyframes spgc-shimmer {
  0%{background-position:-200% center}
  100%{background-position:200% center}
}
@keyframes spgc-winner-in {
  0%  { transform:scale(0.25) translateY(40px); opacity:0; }
  60% { transform:scale(1.22) translateY(-8px); opacity:1; }
  100%{ transform:scale(1)    translateY(0);    opacity:1; }
}
@keyframes spgc-winner-out {
  0%  { transform:scale(1);    opacity:1; }
  100%{ transform:scale(0.7);  opacity:0; }
}
@keyframes spgc-glow-pulse {
  0%,100%{ box-shadow:0 0 40px 10px rgba(251,191,36,0.5), 0 0 0 0 rgba(251,191,36,0); }
  50%    { box-shadow:0 0 80px 20px rgba(251,191,36,0.9), 0 0 0 16px rgba(251,191,36,0.12); }
}
@keyframes spgc-spark {
  0%  { transform:translate(0,0) scale(1);   opacity:1; }
  100%{ transform:translate(var(--sx),var(--sy)) scale(0); opacity:0; }
}
@keyframes spgc-stars-spin {
  from{ transform:rotate(0deg); }
  to  { transform:rotate(360deg); }
}
@keyframes spgc-label-pop {
  0%  { transform:scale(0.7); opacity:0; }
  70% { transform:scale(1.08); }
  100%{ transform:scale(1);   opacity:1; }
}
@media(prefers-reduced-motion:reduce){
  .spgc-hover-anim  { animation:none!important; }
  .spgc-winner-card { animation:spgc-winner-in 0.3s ease both!important; }
  .spgc-spark       { animation:none!important; opacity:0!important; }
  .spgc-stars       { animation:none!important; }
}
`;

const CARD_COLORS = ["#7c3aed","#be185d","#0369a1"];
const REWARD_ICONS: Record<string, string> = {
  wallet:"💳", points:"⭐", discount:"🏷️",
  free_shipping:"🚚", free_product:"🎁", bonus_chest:"💎",
};

const SPARKS = [
  { sx:"-80px", sy:"-90px" }, { sx:"80px",  sy:"-90px" },
  { sx:"-110px",sy:"10px"  }, { sx:"110px", sy:"10px"  },
  { sx:"-70px", sy:"90px"  }, { sx:"70px",  sy:"90px"  },
  { sx:"0px",   sy:"-110px"}, { sx:"0px",   sy:"110px" },
];

type CardState = { index: number; revealed: boolean; labelAr?: string; labelEn?: string; type?: string; icon?: string };

type Props = {
  cards: CardState[];
  maxPicks: number;
  picksDone: number;
  onPick: (index: number) => Promise<{ card: { type: string; icon?: string; labelAr: string; labelEn?: string }; advanceToStep3: boolean }>;
  onPickComplete: () => Promise<void>;
};

export function StorePickGiftCards({ cards, maxPicks, picksDone, onPick, onPickComplete }: Props) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;

  const [picking, setPicking]     = useState<number | null>(null);
  const [flipped, setFlipped]     = useState<Record<number, boolean>>({});
  const [winner, setWinner]       = useState<{ type: string; icon?: string; labelAr: string; labelEn?: string } | null>(null);
  const [winnerOut, setWinnerOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canPick = picksDone < maxPicks;

  const handle = async (idx: number) => {
    if (!canPick || picking !== null || cards[idx]?.revealed || flipped[idx]) return;
    setPicking(idx);
    setFlipped(prev => ({ ...prev, [idx]: true }));

    let result: { card: { type: string; icon?: string; labelAr: string; labelEn?: string }; advanceToStep3: boolean } | null = null;
    try {
      result = await onPick(idx);
    } catch {
      setFlipped(prev => { const n = { ...prev }; delete n[idx]; return n; });
      setPicking(null);
      return;
    }
    setPicking(null);

    timerRef.current = setTimeout(() => {
      setWinner({ type: result!.card.type, icon: result!.card.icon, labelAr: result!.card.labelAr, labelEn: result!.card.labelEn });
      setWinnerOut(false);

      timerRef.current = setTimeout(() => {
        setWinnerOut(true);
        timerRef.current = setTimeout(() => {
          setWinner(null);
          setWinnerOut(false);
          void onPickComplete();
        }, 380);
      }, 2200);
    }, 550);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const isFlipped = (i: number) => cards[i]?.revealed || flipped[i];

  const getLabel = (w: { labelAr: string; labelEn?: string }) =>
    lang === "en" && w.labelEn ? w.labelEn : w.labelAr;

  return (
    <>
      <style>{CSS}</style>

      {winner && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(10,0,18,0.82)",
          backdropFilter: "blur(6px)",
        }}>
          <div
            className="spgc-stars"
            style={{
              position: "absolute",
              width: 340, height: 340,
              borderRadius: "50%",
              animation: "spgc-stars-spin 6s linear infinite",
              pointerEvents: "none",
            }}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * 360;
              return (
                <div key={i} style={{
                  position: "absolute",
                  top: "50%", left: "50%",
                  transform: `rotate(${a}deg) translateY(-168px)`,
                  fontSize: 14, opacity: 0.7,
                  marginTop: -8, marginLeft: -8,
                }}>
                  {i % 2 === 0 ? "✦" : "✧"}
                </div>
              );
            })}
          </div>

          {SPARKS.map((s, i) => (
            <div
              key={i}
              className="spgc-spark"
              style={{
                position: "absolute",
                width: 10, height: 10,
                borderRadius: "50%",
                background: i % 3 === 0 ? "#fbbf24" : i % 3 === 1 ? "#e91e63" : "#a78bfa",
                ["--sx" as string]: s.sx,
                ["--sy" as string]: s.sy,
                animation: `spgc-spark 0.9s ease-out ${i * 0.07}s both`,
              }}
            />
          ))}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <div
              className="spgc-winner-card"
              style={{
                width: 160, height: 240,
                borderRadius: 22,
                background: "linear-gradient(145deg,#10b981,#065f46)",
                border: "2px solid rgba(16,185,129,0.5)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10,
                animation: winnerOut
                  ? "spgc-winner-out 0.38s ease forwards"
                  : "spgc-winner-in 0.7s cubic-bezier(.34,1.56,.64,1) both, spgc-glow-pulse 1.4s ease-in-out 0.7s infinite",
              }}
            >
              <div style={{
                position: "absolute", inset: 0, borderRadius: 22,
                background: "linear-gradient(135deg,rgba(255,255,255,0.12) 0%,transparent 60%)",
                pointerEvents: "none",
              }} />
              <div style={{ fontSize: 56 }}>{winner.icon || REWARD_ICONS[winner.type] || "🎁"}</div>
              <div style={{ fontSize: 13, color: "#d1fae5", fontWeight: 800, fontFamily: "Cairo,Tajawal,sans-serif", textAlign: "center", padding: "0 12px", lineHeight: 1.5 }}>
                {getLabel(winner)}
              </div>
            </div>

            <div
              className="spgc-label-pop"
              style={{
                animation: winnerOut ? "none" : "spgc-label-pop 0.5s ease 0.4s both",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", fontFamily: "Cairo,Tajawal,sans-serif", marginBottom: 4 }}>
                {t("🎉 مبروك!", "🎉 Congrats!")}
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", fontFamily: "Cairo,Tajawal,sans-serif" }}>
                {t("فزتِ بـ", "You won")} {getLabel(winner)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", marginBottom: 8, fontFamily: "Cairo,Tajawal,sans-serif" }}>
          🃏 {t("اختاري كارت واحد", "Pick One Card")}
        </h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginBottom: 32, fontFamily: "Cairo,Tajawal,sans-serif" }}>
          {canPick ? t("اضغطي على كارت لتكشفي مكافأتك", "Tap a card to reveal your reward") : t("تم اختيار الكارت…", "Card selected…")}
        </p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          {Array.from({ length: Math.max(3, cards.length) }, (_, i) => {
            const card    = cards[i];
            const flippd  = isFlipped(i);
            const loading = picking === i;
            const color   = CARD_COLORS[i % CARD_COLORS.length];
            const cardLabel = card ? getLabel({ labelAr: card.labelAr ?? "", labelEn: card.labelEn }) : "";

            return (
              <div
                key={i}
                onClick={() => void handle(i)}
                style={{
                  width: 100, height: 150,
                  perspective: "600px",
                  cursor: flippd || !canPick || loading ? "default" : "pointer",
                  flexShrink: 0,
                  opacity: flippd && !isFlipped(i) ? 0.4 : 1,
                  transition: "opacity .3s",
                }}
              >
                <div
                  style={{
                    width: "100%", height: "100%",
                    position: "relative",
                    transformStyle: "preserve-3d",
                    transition: "transform .65s cubic-bezier(.4,0,.2,1)",
                    transform: flippd ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  {/* Front — mystery */}
                  <div
                    className={!flippd && canPick && !loading ? "spgc-hover-anim" : ""}
                    style={{
                      position: "absolute", inset: 0, borderRadius: 16,
                      backfaceVisibility: "hidden",
                      background: `linear-gradient(145deg,${color},#1a0020)`,
                      border: "1.5px solid rgba(255,255,255,.15)",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,.4)",
                      overflow: "hidden",
                      animation: !flippd && canPick && !loading
                        ? `spgc-hover ${2.5 + i * 0.4}s ease-in-out ${i * 0.2}s infinite`
                        : "none",
                    }}
                  >
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,.08) 50%,transparent 100%)",
                      backgroundSize: "200% auto",
                      animation: "spgc-shimmer 2s linear infinite",
                    }} />
                    <div style={{ fontSize: 36, zIndex: 1 }}>❓</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", fontWeight: 700, fontFamily: "Cairo,Tajawal,sans-serif", zIndex: 1 }}>
                      {loading ? "..." : t("اكشفي", "Reveal")}
                    </div>
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
                    <div style={{ fontSize: 30 }}>{card?.icon || REWARD_ICONS[card?.type ?? ""] || "🎁"}</div>
                    <div style={{ fontSize: 11, color: "#fff", fontWeight: 800, textAlign: "center", fontFamily: "Cairo,Tajawal,sans-serif", lineHeight: 1.4 }}>
                      {cardLabel}
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
