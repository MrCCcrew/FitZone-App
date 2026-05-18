"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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
        aria-label={isUnlocked ? "تم فتح هدية المتجر" : "اقتربتِ من الهدية"}
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
                  مبروك! هدية المتجر اتفتحت 🎉
                </div>
                <div style={{ fontSize: 12, color: "#86efac", marginTop: 2 }}>
                  {payload.rewardLabel} سيُضاف تلقائياً مع الطلب
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#be123c" }}>
                  اتقربتِ من الهدية 🎁
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  باقي{" "}
                  <span style={{ color: "#e91e63", fontWeight: 700 }}>
                    {payload.remaining.toLocaleString("ar-EG")} ج.م
                  </span>{" "}
                  وتفتحي هدية المتجر
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
