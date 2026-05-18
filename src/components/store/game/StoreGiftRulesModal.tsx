"use client";

const CSS = `
@keyframes sgrm-in {
  from{opacity:0;transform:translateY(24px) scale(.96)}
  to{opacity:1;transform:translateY(0) scale(1)}
}
`;

const RULES = [
  { icon: "🎰", text: "الفي العجلة واحصلي على مكافأة عشوائية من بنك الهدايا." },
  { icon: "🃏", text: "اختاري كارت واحد لتكشفي مكافأة إضافية." },
  { icon: "🎁", text: "اختاري منتجات مجانية من المتجر بحسب عدد الهدايا المتاحة لك." },
  { icon: "✅", text: "تُضاف الهدايا تلقائياً لطلبك عند التأكيد." },
  { icon: "⏱", text: "جلسة الهدايا صالحة لمدة 24 ساعة فقط." },
  { icon: "📦", text: "الهدايا مرتبطة بطلب متجر واحد فقط وغير قابلة للتحويل." },
];

export function StoreGiftRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <style>{CSS}</style>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,.75)",
          zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "linear-gradient(145deg,#1a0030,#0d001a)",
            border: "1.5px solid rgba(255,255,255,.12)",
            borderRadius: 22,
            padding: "28px 24px",
            maxWidth: 380,
            width: "100%",
            animation: "sgrm-in .35s cubic-bezier(.4,0,.2,1) both",
          }}
        >
          <h2 style={{ textAlign: "center", fontSize: 20, fontWeight: 900, color: "#fbbf24", marginBottom: 20, fontFamily: "Cairo,Tajawal,sans-serif" }}>
            📋 قواعد لعبة الهدايا
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {RULES.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{r.icon}</span>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.6, fontFamily: "Cairo,Tajawal,sans-serif" }}>
                  {r.text}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#f59e0b,#f97316)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: "Cairo,Tajawal,sans-serif",
            }}
          >
            فهمت ✓
          </button>
        </div>
      </div>
    </>
  );
}
