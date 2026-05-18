"use client";

const CSS = `
@keyframes srm-in {
  from{transform:scale(.7) translateY(40px);opacity:0}
  to{transform:scale(1) translateY(0);opacity:1}
}
@keyframes srm-glow {
  0%,100%{box-shadow:0 0 30px rgba(251,191,36,.3)}
  50%{box-shadow:0 0 60px rgba(251,191,36,.7),0 0 100px rgba(249,115,22,.4)}
}
@keyframes srm-crown {
  0%,100%{transform:translateY(0) rotate(-5deg)}
  50%{transform:translateY(-8px) rotate(5deg)}
}
@media(prefers-reduced-motion:reduce){
  .srm-card{animation:none!important}
  .srm-crown{animation:none!important}
}
`;

type Reward = { type: string; value: number; labelAr: string };

const REWARD_ICONS: Record<string, string> = {
  wallet: "💳", points: "⭐", discount: "🏷️",
  free_shipping: "🚚", free_product: "🎁", bonus_chest: "📦",
};

export function StoreRewardResultModal({
  reward, onNext,
}: {
  reward: Reward | null;
  onNext: () => void;
}) {
  if (!reward) return null;
  return (
    <>
      <style>{CSS}</style>
      {/* Overlay */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div
          className="srm-card"
          style={{
            background: "linear-gradient(145deg,#1a0030,#0d001a)",
            border: "1.5px solid rgba(251,191,36,.4)",
            borderRadius: 24,
            padding: "40px 32px",
            maxWidth: 340,
            width: "100%",
            textAlign: "center",
            animation: "srm-in .5s cubic-bezier(.4,0,.2,1) both, srm-glow 2s ease-in-out 0.5s infinite",
          }}
        >
          {/* Crown */}
          <div className="srm-crown" style={{ fontSize: 48, marginBottom: 8, animation: "srm-crown 2s ease-in-out infinite" }}>
            {REWARD_ICONS[reward.type] ?? "🎁"}
          </div>
          {/* Stars */}
          <div style={{ fontSize: 18, letterSpacing: 6, color: "#fbbf24", marginBottom: 16 }}>★ ★ ★</div>
          {/* Title */}
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", marginBottom: 8, fontFamily: "Cairo,Tajawal,sans-serif" }}>
            مبروك! 🎉
          </h2>
          <p style={{ fontSize: 16, color: "#fff", fontWeight: 700, marginBottom: 6, fontFamily: "Cairo,Tajawal,sans-serif" }}>
            حصلتِ على:
          </p>
          <div style={{
            background: "rgba(251,191,36,.12)",
            border: "1px solid rgba(251,191,36,.3)",
            borderRadius: 12,
            padding: "10px 20px",
            marginBottom: 28,
            fontSize: 18,
            fontWeight: 900,
            color: "#fde68a",
            fontFamily: "Cairo,Tajawal,sans-serif",
          }}>
            {reward.labelAr}
          </div>
          <button
            onClick={onNext}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              border: "none", background: "linear-gradient(135deg,#f59e0b,#f97316)",
              color: "#fff", fontSize: 16, fontWeight: 900,
              cursor: "pointer", fontFamily: "Cairo,Tajawal,sans-serif",
              boxShadow: "0 6px 24px rgba(249,115,22,.45)",
            }}
          >
            كمّلي للخطوة التالية ←
          </button>
        </div>
      </div>
    </>
  );
}
