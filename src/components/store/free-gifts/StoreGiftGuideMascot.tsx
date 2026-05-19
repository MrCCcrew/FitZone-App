"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/language";

export type StoreGiftGuideMascotProps = {
  variant?: "welcome" | "spin" | "cards" | "gifts" | "success";
  reducedMotion?: boolean;
  className?: string;
};

const COPY = {
  ar: {
    welcome: {
      title: "FitZone بتقدملك هدايا متنوعة 🎁",
      description: "لفّي العجلة، افتحي الكروت، واختاري هداياك من المتجر.",
      note: "الهدايا متاحة على طلبات المتجر فقط.",
      cta: "ابدئي رحلة الهدايا",
    },
    spin: {
      title: "FitZone بتقدملك هدايا متنوعة 🎁",
      description: "ابدئي باللفة وشوفي هديتك الأولى.",
      note: "الهدايا متاحة على طلبات المتجر فقط.",
      cta: "ابدئي رحلة الهدايا",
    },
    cards: {
      title: "FitZone بتقدملك هدايا متنوعة 🎁",
      description: "اختاري كارت وافتحي بونص جديد.",
      note: "الهدايا متاحة على طلبات المتجر فقط.",
      cta: "كمّلي التحدي",
    },
    gifts: {
      title: "FitZone بتقدملك هدايا متنوعة 🎁",
      description: "اختاري هداياك من منتجات المتجر.",
      note: "الهدايا متاحة على طلبات المتجر فقط.",
      cta: "كمّلي التحدي",
    },
    success: {
      title: "FitZone بتقدملك هدايا متنوعة 🎁",
      description: "مبروك! هداياك جاهزة مع طلب المتجر.",
      note: "الهدايا متاحة على طلبات المتجر فقط.",
      cta: "كمّلي التحدي",
    },
  },
  en: {
    welcome: {
      title: "FitZone brings you special gifts 🎁",
      description: "Spin the wheel, reveal your cards, and pick your store gifts.",
      note: "Gifts apply to store orders only.",
      cta: "Start your gift journey",
    },
    spin: {
      title: "FitZone brings you special gifts 🎁",
      description: "Start with a spin and see your first gift.",
      note: "Gifts apply to store orders only.",
      cta: "Start your gift journey",
    },
    cards: {
      title: "FitZone brings you special gifts 🎁",
      description: "Pick a card and reveal a new bonus.",
      note: "Gifts apply to store orders only.",
      cta: "Continue the challenge",
    },
    gifts: {
      title: "FitZone brings you special gifts 🎁",
      description: "Choose your gifts from store products.",
      note: "Gifts apply to store orders only.",
      cta: "Continue the challenge",
    },
    success: {
      title: "FitZone brings you special gifts 🎁",
      description: "Congrats! Your gifts are ready with your store order.",
      note: "Gifts apply to store orders only.",
      cta: "Continue the challenge",
    },
  },
} as const;

const CSS = `
@keyframes guideEntrance {
  from { opacity: 0; transform: translateY(24px) scale(.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes guideFloat {
  0%,100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(.8deg); }
}
@keyframes guideBlink {
  0%, 46%, 52%, 100% { transform: scaleY(1); }
  48%, 50% { transform: scaleY(.08); }
}
@keyframes guideWave {
  0%,100% { transform: rotate(-8deg); }
  25% { transform: rotate(16deg); }
  50% { transform: rotate(-4deg); }
  75% { transform: rotate(18deg); }
}
@keyframes guideHeadTilt {
  0%,100% { transform: rotate(-2deg); }
  50% { transform: rotate(3deg); }
}
@keyframes guideBreath {
  0%,100% { transform: scaleY(1) translateY(0); }
  50% { transform: scaleY(1.02) translateY(-2px); }
}
@keyframes guideSparkle {
  0% { opacity: 0; transform: scale(.4) translateY(6px); }
  50% { opacity: 1; transform: scale(1) translateY(-2px); }
  100% { opacity: 0; transform: scale(.5) translateY(-10px); }
}
@keyframes guideCardGlow {
  0%,100% { box-shadow: 0 18px 50px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.08), 0 0 26px rgba(233,30,99,.12); }
  50% { box-shadow: 0 24px 56px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.12), 0 0 38px rgba(251,191,36,.18); }
}
@keyframes guideGiftBob {
  0%,100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-5px) rotate(3deg); }
}
@keyframes guideWandPulse {
  0%,100% { filter: drop-shadow(0 0 6px rgba(251,191,36,.4)); }
  50% { filter: drop-shadow(0 0 14px rgba(251,191,36,.7)); }
}
@media (prefers-reduced-motion: reduce) {
  .sggm-card, .sggm-figure, .sggm-head, .sggm-arm-right, .sggm-sparkle, .sggm-float-icon, .sggm-gift-box, .sggm-wand-star {
    animation: none !important;
  }
}
`;

export function StoreGiftGuideMascot({
  variant = "welcome",
  reducedMotion,
  className,
}: StoreGiftGuideMascotProps) {
  const { lang } = useLang();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(Boolean(reducedMotion));

  useEffect(() => {
    if (reducedMotion !== undefined) {
      setPrefersReducedMotion(reducedMotion);
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [reducedMotion]);

  const copySet = lang === "ar" ? COPY.ar : COPY.en;
  const copy = copySet[variant];
  const dir = lang === "ar" ? "rtl" : "ltr";
  const isCelebration = variant === "success";
  const isCards = variant === "cards";
  const isGifts = variant === "gifts";
  const isSpin = variant === "spin" || variant === "welcome";

  return (
    <>
      <style>{CSS}</style>
      <section
        dir={dir}
        data-variant={variant}
        className={className}
        style={{
          position: "relative",
          margin: "10px 16px 14px",
          borderRadius: 28,
          overflow: "hidden",
          animation: "guideEntrance .55s cubic-bezier(.22,1,.36,1) both",
        }}
      >
        <div
          className="sggm-card"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "minmax(0,1.15fr) minmax(148px,188px)",
            alignItems: "center",
            gap: 14,
            padding: "18px 18px 18px 20px",
            borderRadius: 28,
            background: "linear-gradient(145deg, rgba(31,6,26,.88), rgba(59,9,41,.72))",
            border: "1px solid rgba(255,255,255,.12)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            animation: prefersReducedMotion ? "guideEntrance .35s ease both" : "guideCardGlow 4.6s ease-in-out infinite",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 1,
              borderRadius: 27,
              background: "linear-gradient(135deg, rgba(255,255,255,.11), rgba(255,255,255,.02) 28%, rgba(251,191,36,.1) 60%, rgba(233,30,99,.08))",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: -80,
              background: "radial-gradient(circle at top left, rgba(251,191,36,.16), transparent 35%), radial-gradient(circle at 82% 18%, rgba(233,30,99,.16), transparent 28%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "linear-gradient(180deg,#fbbf24,#f97316)",
                boxShadow: "0 0 18px rgba(251,191,36,.65)",
              }} />
              <span style={{
                padding: "6px 11px",
                borderRadius: 999,
                background: "rgba(255,255,255,.08)",
                color: "#f7d98b",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".2px",
                fontFamily: "Cairo,Tajawal,sans-serif",
              }}>
                {lang === "ar" ? "دليل الهدايا" : "Gift Guide"}
              </span>
            </div>

            <h2 style={{
              margin: 0,
              color: "#fff7de",
              fontSize: 22,
              lineHeight: 1.4,
              fontWeight: 900,
              textWrap: "balance",
              fontFamily: "Cairo,Tajawal,sans-serif",
            }}>
              {copy.title}
            </h2>

            <p style={{
              margin: "10px 0 8px",
              color: "rgba(255,255,255,.82)",
              fontSize: 14,
              lineHeight: 1.8,
              maxWidth: 420,
              fontFamily: "Cairo,Tajawal,sans-serif",
            }}>
              {copy.description}
            </p>

            <p style={{
              margin: "0 0 14px",
              color: "#ffc8df",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "Cairo,Tajawal,sans-serif",
            }}>
              {copy.note}
            </p>

            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(249,115,22,.22), rgba(233,30,99,.22))",
                border: "1px solid rgba(255,255,255,.12)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 900,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.1)",
                fontFamily: "Cairo,Tajawal,sans-serif",
              }}>
                <span>{copy.cta}</span>
                <span style={{ color: "#fbbf24" }}>{lang === "ar" ? "←" : "→"}</span>
              </span>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              zIndex: 2,
              width: "100%",
              minHeight: 190,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div className="sggm-figure" style={{ position: "relative", width: 170, height: 182, animation: prefersReducedMotion ? "none" : "guideFloat 3.8s ease-in-out infinite" }}>
              <div style={{
                position: "absolute",
                left: "50%",
                bottom: 10,
                width: 96,
                height: 22,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(0,0,0,.32), rgba(0,0,0,0))",
                transform: "translateX(-50%)",
                filter: "blur(2px)",
              }} />

              <div className="sggm-sparkle" style={{ position: "absolute", top: 20, left: 10, fontSize: 16, color: "#fbbf24", animation: prefersReducedMotion ? "none" : "guideSparkle 2.4s ease-in-out infinite" }}>✦</div>
              <div className="sggm-sparkle" style={{ position: "absolute", top: 38, right: 0, fontSize: 12, color: "#fff5d8", animation: prefersReducedMotion ? "none" : "guideSparkle 2.7s ease-in-out .5s infinite" }}>✦</div>
              <div className="sggm-sparkle" style={{ position: "absolute", bottom: 58, right: 18, fontSize: 14, color: "#ff8bbd", animation: prefersReducedMotion ? "none" : "guideSparkle 2.2s ease-in-out .9s infinite" }}>✦</div>

              <div className="sggm-float-icon" style={{ position: "absolute", top: 10, right: 28, fontSize: 20, filter: "drop-shadow(0 0 8px rgba(251,191,36,.28))", animation: prefersReducedMotion ? "none" : "guideFloat 3.6s ease-in-out .6s infinite" }}>🎁</div>
              <div className="sggm-float-icon" style={{ position: "absolute", bottom: 34, left: 4, fontSize: 17, filter: "drop-shadow(0 0 8px rgba(233,30,99,.2))", animation: prefersReducedMotion ? "none" : "guideFloat 3.2s ease-in-out 1.2s infinite" }}>🎀</div>

              <div className="sggm-body" style={{
                position: "absolute",
                left: "50%",
                bottom: 20,
                width: 92,
                height: 84,
                transform: "translateX(-50%)",
                borderRadius: "42px 42px 32px 32px",
                background: "linear-gradient(180deg,#ffedf4 0%, #f8d9e8 48%, #f0b9d2 100%)",
                boxShadow: "inset 0 3px 0 rgba(255,255,255,.45), inset 0 -8px 18px rgba(182,83,127,.2), 0 16px 30px rgba(0,0,0,.16)",
                animation: prefersReducedMotion ? "none" : "guideBreath 3.5s ease-in-out infinite",
              }}>
                <div style={{
                  position: "absolute",
                  inset: "20px 15px 0",
                  borderRadius: "40px 40px 26px 26px",
                  background: "linear-gradient(180deg,#d91662,#a80f4a)",
                  opacity: .94,
                }} />
                <div style={{
                  position: "absolute",
                  top: 10,
                  left: "50%",
                  width: 58,
                  height: 30,
                  transform: "translateX(-50%)",
                  borderRadius: "20px 20px 24px 24px",
                  border: "2px solid rgba(255,255,255,.22)",
                  borderTopColor: "rgba(255,255,255,.5)",
                }} />
              </div>

              <div className="sggm-arm-left" style={{
                position: "absolute",
                left: 36,
                bottom: 70,
                width: 24,
                height: 64,
                borderRadius: 20,
                transformOrigin: "50% 10px",
                transform: isSpin ? "rotate(42deg)" : isCards ? "rotate(18deg)" : "rotate(6deg)",
                background: "linear-gradient(180deg,#fff4f7,#f5c5db)",
                boxShadow: "inset 0 2px 0 rgba(255,255,255,.5)",
              }}>
                <div style={{
                  position: "absolute",
                  bottom: -5,
                  left: "50%",
                  width: 20,
                  height: 18,
                  transform: "translateX(-50%)",
                  borderRadius: "50%",
                  background: "#f8d7e6",
                }} />
              </div>

              <div className="sggm-arm-right" style={{
                position: "absolute",
                right: 34,
                bottom: 72,
                width: 24,
                height: 64,
                borderRadius: 20,
                transformOrigin: "50% 10px",
                transform: isCards ? "rotate(-16deg)" : isGifts || isCelebration ? "rotate(-8deg)" : "rotate(-26deg)",
                background: "linear-gradient(180deg,#fff4f7,#f5c5db)",
                boxShadow: "inset 0 2px 0 rgba(255,255,255,.5)",
                animation: prefersReducedMotion || !isSpin ? "none" : "guideWave 1.8s ease-in-out infinite",
              }}>
                <div style={{
                  position: "absolute",
                  bottom: -5,
                  left: "50%",
                  width: 20,
                  height: 18,
                  transform: "translateX(-50%)",
                  borderRadius: "50%",
                  background: "#f8d7e6",
                }} />
              </div>

              <div className="sggm-head" style={{
                position: "absolute",
                left: "50%",
                top: 24,
                width: 102,
                height: 96,
                transform: "translateX(-50%)",
                animation: prefersReducedMotion ? "none" : "guideHeadTilt 3.4s ease-in-out infinite",
              }}>
                <div className="sggm-ear-left" style={{
                  position: "absolute",
                  left: 14,
                  top: -26,
                  width: 28,
                  height: 70,
                  borderRadius: "20px 20px 16px 16px",
                  background: "linear-gradient(180deg,#fff2f7,#f2b8d6 88%)",
                  transform: "rotate(-9deg)",
                  boxShadow: "inset 0 2px 0 rgba(255,255,255,.45)",
                }}>
                  <div style={{ position: "absolute", inset: "10px 7px 12px", borderRadius: 18, background: "linear-gradient(180deg,#ff8dbd,#ffb7d7)" }} />
                </div>
                <div className="sggm-ear-right" style={{
                  position: "absolute",
                  right: 14,
                  top: -26,
                  width: 28,
                  height: 70,
                  borderRadius: "20px 20px 16px 16px",
                  background: "linear-gradient(180deg,#fff2f7,#f2b8d6 88%)",
                  transform: "rotate(9deg)",
                  boxShadow: "inset 0 2px 0 rgba(255,255,255,.45)",
                }}>
                  <div style={{ position: "absolute", inset: "10px 7px 12px", borderRadius: 18, background: "linear-gradient(180deg,#ff8dbd,#ffb7d7)" }} />
                </div>

                <div style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "46px 46px 40px 40px",
                  background: "linear-gradient(180deg,#fff9fc 0%, #ffe8f2 45%, #f6ccdf 100%)",
                  boxShadow: "inset 0 4px 0 rgba(255,255,255,.52), inset 0 -10px 22px rgba(192,92,136,.18), 0 18px 26px rgba(0,0,0,.12)",
                }} />

                <div style={{
                  position: "absolute",
                  left: "50%",
                  top: 7,
                  width: 68,
                  height: 16,
                  transform: "translateX(-50%)",
                  borderRadius: 999,
                  background: "linear-gradient(90deg,#f97316,#e91e63 68%,#991b5f)",
                  boxShadow: "0 0 20px rgba(233,30,99,.18)",
                }} />

                <div style={{
                  position: "absolute",
                  left: "50%",
                  top: 44,
                  width: 50,
                  height: 34,
                  transform: "translateX(-50%)",
                  borderRadius: "24px",
                  background: "linear-gradient(180deg,#fff3f8,#ffd8e8)",
                  boxShadow: "inset 0 2px 0 rgba(255,255,255,.55)",
                }} />

                <div style={{ position: "absolute", left: 28, top: 36, width: 18, height: 10, display: "flex", justifyContent: "center", alignItems: "center", transformOrigin: "50% 50%", animation: prefersReducedMotion ? "none" : "guideBlink 4.2s linear infinite" }}>
                  <span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: "#24111b", boxShadow: "0 0 0 4px #fff" }} />
                </div>
                <div style={{ position: "absolute", right: 28, top: 36, width: 18, height: 10, display: "flex", justifyContent: "center", alignItems: "center", transformOrigin: "50% 50%", animation: prefersReducedMotion ? "none" : "guideBlink 4.2s linear .16s infinite" }}>
                  <span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: "#24111b", boxShadow: "0 0 0 4px #fff" }} />
                </div>

                <div style={{
                  position: "absolute",
                  left: "50%",
                  top: 50,
                  width: 14,
                  height: 10,
                  transform: "translateX(-50%)",
                  borderRadius: "50% 50% 60% 60%",
                  background: "#5b2540",
                }} />
                <div style={{
                  position: "absolute",
                  left: "50%",
                  top: 60,
                  width: isCelebration ? 26 : 20,
                  height: isCelebration ? 12 : 9,
                  transform: "translateX(-50%)",
                  borderBottom: "3px solid #7d1d49",
                  borderRadius: "0 0 24px 24px",
                }} />

                <div style={{ position: "absolute", left: 20, top: 58, width: 14, height: 10, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,143,181,.6), rgba(255,143,181,0))" }} />
                <div style={{ position: "absolute", right: 20, top: 58, width: 14, height: 10, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,143,181,.6), rgba(255,143,181,0))" }} />
              </div>

              {isCards && (
                <div style={{
                  position: "absolute",
                  right: 6,
                  bottom: 60,
                  width: 40,
                  height: 54,
                  borderRadius: 12,
                  background: "linear-gradient(180deg,#7c3aed,#4c1d95)",
                  border: "1px solid rgba(255,255,255,.16)",
                  boxShadow: "0 12px 28px rgba(76,29,149,.36)",
                  transform: "rotate(10deg)",
                }}>
                  <div style={{ position: "absolute", inset: 5, borderRadius: 10, background: "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.04))" }} />
                  <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", color: "#fdf4ff", fontSize: 18 }}>✦</div>
                </div>
              )}

              {(isGifts || isCelebration) && (
                <div className="sggm-gift-box" style={{
                  position: "absolute",
                  right: 2,
                  bottom: 52,
                  width: 52,
                  height: 46,
                  borderRadius: 14,
                  background: "linear-gradient(180deg,#ff77a9,#d91662)",
                  boxShadow: "0 16px 28px rgba(217,22,98,.28)",
                  animation: prefersReducedMotion ? "none" : "guideGiftBob 2.6s ease-in-out infinite",
                }}>
                  <div style={{ position: "absolute", inset: "0 22px", background: "linear-gradient(180deg,#ffd96d,#fbbf24)" }} />
                  <div style={{ position: "absolute", top: 19, insetInline: 0, height: 8, background: "linear-gradient(90deg,#ffd96d,#fbbf24)" }} />
                  <div style={{ position: "absolute", top: -8, left: 9, width: 16, height: 16, border: "4px solid #ffd96d", borderRadius: "50% 50% 0 50%", transform: "rotate(-28deg)" }} />
                  <div style={{ position: "absolute", top: -8, right: 9, width: 16, height: 16, border: "4px solid #ffd96d", borderRadius: "50% 50% 50% 0", transform: "rotate(28deg)" }} />
                </div>
              )}

              {isSpin && (
                <div style={{
                  position: "absolute",
                  right: 0,
                  top: 72,
                  width: 62,
                  height: 16,
                  borderRadius: 999,
                  background: "linear-gradient(90deg, rgba(251,191,36,0), rgba(251,191,36,.85))",
                  transform: "rotate(-10deg)",
                  opacity: .85,
                }} />
              )}

              {!isCards && !isGifts && !isCelebration && (
                <div style={{
                  position: "absolute",
                  right: 4,
                  bottom: 70,
                  width: 58,
                  height: 12,
                  transform: "rotate(-18deg)",
                }}>
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 4,
                    width: 42,
                    height: 4,
                    borderRadius: 999,
                    background: "linear-gradient(90deg,#fff7d6,#fbbf24)",
                  }} />
                  <div className="sggm-wand-star" style={{
                    position: "absolute",
                    right: 0,
                    top: -4,
                    fontSize: 16,
                    color: "#fff2be",
                    animation: prefersReducedMotion ? "none" : "guideWandPulse 2.4s ease-in-out infinite",
                  }}>✦</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 720px) {
            section[data-variant] > .sggm-card {
              grid-template-columns: 1fr !important;
              padding: 18px 16px !important;
              gap: 4px !important;
            }
          }
        `}</style>
      </section>
    </>
  );
}
