"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/language";

const CSS = `
@keyframes sgb-toast-in {
  from{transform:translateY(100%) scale(.9);opacity:0}
  to{transform:translateY(0) scale(1);opacity:1}
}
@keyframes sgb-toast-out {
  from{transform:translateY(0) scale(1);opacity:1}
  to{transform:translateY(12px) scale(.95);opacity:0}
}
@media (prefers-reduced-motion:reduce){
  .sgb-toast-enter{animation:none!important;opacity:1!important}
  .sgb-toast-leave{animation:none!important;opacity:0!important;transition:opacity .2s!important}
}
`;

export type GiftToastPayload =
  | { type: "progress"; remaining: number }
  | { type: "unlocked"; rewardLabel: string };

declare global {
  interface WindowEventMap {
    "sgb-toast": CustomEvent<GiftToastPayload>;
  }
}

export function dispatchGiftToast(payload: GiftToastPayload) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sgb-toast", { detail: payload }));
  }
}

type ToastState = { payload: GiftToastPayload; id: number; leaving: boolean };

export function StoreGiftToast() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;

  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setToast(prev => prev ? { ...prev, leaving: true } : null);
    removeTimer.current = setTimeout(() => setToast(null), 320);
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent<GiftToastPayload>) => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (removeTimer.current) clearTimeout(removeTimer.current);
      setToast({ payload: e.detail, id: Date.now(), leaving: false });
      dismissTimer.current = setTimeout(dismiss, 4000);
    };
    window.addEventListener("sgb-toast", handler);
    return () => {
      window.removeEventListener("sgb-toast", handler);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, [dismiss]);

  if (!toast) return <style>{CSS}</style>;

  const { payload, leaving } = toast;
  const isUnlocked = payload.type === "unlocked";

  return (
    <>
      <style>{CSS}</style>
      <div
        role="status"
        aria-live="polite"
        aria-label={isUnlocked ? t("تم فتح هدية المتجر", "Store gift unlocked") : t("اقتربتِ من الهدية", "Getting closer to your gift")}
        className={leaving ? "sgb-toast-leave" : "sgb-toast-enter"}
        style={{
          position: "fixed",
          bottom: 76,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          animation: leaving
            ? "sgb-toast-out .3s ease-in both"
            : "sgb-toast-in .35s cubic-bezier(.4,0,.2,1) both",
          maxWidth: 320,
          width: "calc(100vw - 32px)",
          pointerEvents: "none",
        }}
      >
        <div style={{
          background: isUnlocked ? "#14532d" : "#fff",
          border: `1.5px solid ${isUnlocked ? "#22c55e" : "#fce7f3"}`,
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: isUnlocked
            ? "0 8px 32px rgba(22,163,74,.3)"
            : "0 8px 32px rgba(233,30,99,.15)",
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{isUnlocked ? "🎉" : "🎁"}</span>
          <div>
            {isUnlocked ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#4ade80" }}>
                  {t("مبروك! هدية المتجر اتفتحت 🎉", "Congrats! Your store gift is unlocked 🎉")}
                </div>
                <div style={{ fontSize: 12, color: "#86efac", marginTop: 2 }}>
                  {(payload as { type: "unlocked"; rewardLabel: string }).rewardLabel}{" "}
                  {t("سيُضاف تلقائياً مع الطلب", "will be added automatically to your order")}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#be123c" }}>
                  {t("اتقربتِ من الهدية 🎁", "Getting closer to your gift 🎁")}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  {lang === "ar" ? (
                    <>
                      باقي{" "}
                      <span style={{ color: "#e91e63", fontWeight: 700 }}>
                        {(payload as { type: "progress"; remaining: number }).remaining.toLocaleString("ar-EG")} ج.م
                      </span>{" "}
                      وتفتحي هدية المتجر
                    </>
                  ) : (
                    <>
                      <span style={{ color: "#e91e63", fontWeight: 700 }}>
                        {(payload as { type: "progress"; remaining: number }).remaining.toLocaleString("en-US")} EGP
                      </span>{" "}
                      more to unlock your store gift
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
