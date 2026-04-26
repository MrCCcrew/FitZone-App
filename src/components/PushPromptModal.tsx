"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "fitzone_push_prompted";

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Resolves navigator.serviceWorker.ready with a timeout fallback
async function swReady(ms = 8000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("sw-timeout")), ms)
    ),
  ]);
}

export default function PushPromptModal() {
  const [visible, setVisible]   = useState(false);
  const [animIn, setAnimIn]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show if:  already prompted / permission already decided / no SW support
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "default") return;

    // Register SW early so it's ready before the user taps the button
    if (!navigator.serviceWorker.controller) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Pre-fetch VAPID key in the background
    fetch("/api/push/subscribe")
      .then((r) => r.json())
      .then((d: { vapidPublicKey?: string }) => { if (d.vapidPublicKey) setVapidKey(d.vapidPublicKey); })
      .catch(() => {});

    // Show after 3 s delay; only skip if we confirm an active subscription
    let timer: ReturnType<typeof setTimeout>;
    swReady(5000)
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) { localStorage.setItem(STORAGE_KEY, "1"); return; }
        timer = setTimeout(() => {
          setVisible(true);
          requestAnimationFrame(() => setAnimIn(true));
        }, 3000);
      })
      .catch(() => {
        // SW not ready or check failed — show the prompt anyway
        timer = setTimeout(() => {
          setVisible(true);
          requestAnimationFrame(() => setAnimIn(true));
        }, 3000);
      });

    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setAnimIn(false);
    setTimeout(() => setVisible(false), 350);
  }

  async function enable() {
    setLoading(true);
    // Emergency dismiss after 20s total (covers slow permission dialogs in Edge)
    const killTimer = setTimeout(dismiss, 20000);
    try {
      // Get VAPID key with 5s timeout
      let key = vapidKey;
      if (!key) {
        const ac = new AbortController();
        setTimeout(() => ac.abort(), 5000);
        const keyRes = await fetch("/api/push/subscribe", { signal: ac.signal });
        const data = (await keyRes.json()) as { vapidPublicKey?: string };
        key = data.vapidPublicKey ?? null;
      }
      if (!key) { dismiss(); return; }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") { dismiss(); return; }

      // Wait for SW with 6s timeout
      const reg = await swReady(6000);

      // Subscribe with its own 8s timeout
      const sub = await Promise.race([
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("subscribe-timeout")), 8000)
        ),
      ]);

      // POST subscription with 5s timeout
      const postAc = new AbortController();
      setTimeout(() => postAc.abort(), 5000);
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
        signal: postAc.signal,
      });

      clearTimeout(killTimer);
      setDone(true);
      localStorage.setItem(STORAGE_KEY, "1");
      setTimeout(dismiss, 1800);
    } catch {
      dismiss();
    } finally {
      clearTimeout(killTimer);
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop — subtle, doesn't block the whole page */}
      <div
        onClick={dismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,.45)",
          opacity: animIn ? 1 : 0,
          transition: "opacity .35s ease",
        }}
      />

      {/* Card — slides up from bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1001,
          display: "flex",
          justifyContent: "center",
          padding: "0 16px 24px",
          transform: animIn ? "translateY(0)" : "translateY(110%)",
          transition: "transform .4s cubic-bezier(.22,.85,.36,1)",
        }}
      >
        <div style={{
          background: "linear-gradient(160deg,#2a0f1c,#1a0c14)",
          border: "1px solid rgba(233,30,99,.35)",
          borderRadius: 22,
          padding: "26px 24px 22px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 -8px 40px rgba(233,30,99,.18), 0 24px 60px rgba(0,0,0,.5)",
          textAlign: "center",
          fontFamily: "'Cairo','Tajawal',sans-serif",
        }}>

          {done ? (
            /* ── Success state ── */
            <div style={{ padding: "8px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>
                تم تفعيل الإشعارات!
              </div>
              <div style={{ color: "#c9b8c2", fontSize: 14, marginTop: 6 }}>
                هتوصلك أول بأول كل العروض والمواعيد 🔔
              </div>
            </div>
          ) : (
            /* ── Prompt state ── */
            <>
              {/* Icon with glow */}
              <div style={{
                width: 66,
                height: 66,
                borderRadius: "50%",
                background: "rgba(233,30,99,.15)",
                border: "1.5px solid rgba(233,30,99,.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 30,
                boxShadow: "0 0 24px rgba(233,30,99,.2)",
              }}>
                🔔
              </div>

              <h3 style={{ color: "#fff", fontWeight: 900, fontSize: 19, marginBottom: 8, lineHeight: 1.3 }}>
                فعّلي إشعارات FitZone
              </h3>
              <p style={{ color: "#c9b8c2", fontSize: 14, lineHeight: 1.7, marginBottom: 22 }}>
                اعرفي أول بأول بـ<strong style={{ color: "#f5c542" }}> العروض الحصرية</strong>،
                مواعيد الكلاسات، وآخر الأخبار — مباشرة على جهازك.
              </p>

              {/* Benefits row */}
              <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 24 }}>
                {[["🎁", "عروض حصرية"], ["📅", "مواعيد الكلاسات"], ["⚡", "أخبار فورية"]].map(([icon, label]) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20 }}>{icon}</div>
                    <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 3, fontWeight: 600 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <button
                onClick={enable}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg,#e91e63,#c2185b)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 15,
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.75 : 1,
                  boxShadow: "0 8px 24px rgba(233,30,99,.35)",
                  marginBottom: 10,
                  fontFamily: "inherit",
                  transition: "opacity .2s",
                }}
              >
                {loading ? "⏳ جاري التفعيل..." : "🔔 فعّلي الإشعارات"}
              </button>

              <button
                onClick={dismiss}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "transparent",
                  color: "#9ca3af",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ربما لاحقاً
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
