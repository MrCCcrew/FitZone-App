"use client";
import { useLang } from "@/lib/language";

export function StoreGiftStepProgress({ step }: { step: number }) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;

  const STEPS = [
    { n: 1, icon: "🎰", label: t("اللفة", "Spin") },
    { n: 2, icon: "🃏", label: t("الكروت", "Cards") },
    { n: 3, icon: "🎁", label: t("الهدايا", "Gifts") },
  ];

  return (
    <>
      <style>{`
        @keyframes sgsp-glow {
          0%,100% { box-shadow: 0 0 12px rgba(233,30,99,0.5), 0 0 0 0 rgba(233,30,99,0); }
          50%     { box-shadow: 0 0 24px rgba(233,30,99,0.9), 0 0 0 6px rgba(233,30,99,0.12); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sgsp-active { animation: none !important; }
        }
      `}</style>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px 0 10px",
        gap: 0,
      }}>
        {STEPS.map((s, i) => {
          const done    = step > s.n;
          const active  = step === s.n;
          return (
            <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
              {/* Circle */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div
                  className={active ? "sgsp-active" : ""}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: done ? 20 : 22,
                    fontWeight: 900,
                    background: done
                      ? "linear-gradient(135deg,#10b981,#059669)"
                      : active
                      ? "linear-gradient(135deg,#e91e63,#c2185b)"
                      : "rgba(255,255,255,0.07)",
                    border: active
                      ? "2px solid rgba(255,255,255,0.35)"
                      : done
                      ? "2px solid rgba(16,185,129,0.5)"
                      : "2px solid rgba(255,255,255,0.12)",
                    color: "#fff",
                    transition: "all 0.35s",
                    animation: active ? "sgsp-glow 2s ease-in-out infinite" : "none",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {(active || done) && (
                    <div style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0,
                      height: "48%",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)",
                      borderRadius: "50% 50% 0 0",
                      pointerEvents: "none",
                    }} />
                  )}
                  {done ? "✓" : s.icon}
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: "Cairo,Tajawal,sans-serif",
                  color: active ? "#f472b6"
                       : done   ? "#10b981"
                       : "rgba(255,255,255,0.35)",
                  transition: "color 0.3s",
                  letterSpacing: "0.3px",
                }}>
                  {s.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div style={{
                  position: "relative",
                  width: 64,
                  height: 3,
                  marginBottom: 22,
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.1)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 4,
                    background: "linear-gradient(90deg,#10b981,#059669)",
                    transform: `scaleX(${step > s.n ? 1 : step === s.n ? 0.5 : 0})`,
                    transformOrigin: "right",
                    transition: "transform 0.5s ease",
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
