"use client";

const STEPS = [
  { n: 1, icon: "🎰", label: "اللفة" },
  { n: 2, icon: "🃏", label: "الكروت" },
  { n: 3, icon: "🎁", label: "الهدايا" },
];

export function StoreGiftStepProgress({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, padding: "20px 0 8px" }}>
      {STEPS.map((s, i) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
              background: step > s.n ? "linear-gradient(135deg,#10b981,#059669)"
                : step === s.n ? "linear-gradient(135deg,#e91e63,#c2185b)"
                : "rgba(255,255,255,.1)",
              border: step === s.n ? "2px solid #f06292" : "2px solid transparent",
              boxShadow: step === s.n ? "0 0 16px rgba(233,30,99,.5)" : "none",
              transition: "all .3s",
            }}>
              {step > s.n ? "✓" : s.icon}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: step === s.n ? "#f06292" : step > s.n ? "#10b981" : "rgba(255,255,255,.4)" }}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              width: 60, height: 2, margin: "0 4px", marginBottom: 20,
              background: step > s.n ? "#10b981" : "rgba(255,255,255,.15)",
              transition: "background .3s",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}
