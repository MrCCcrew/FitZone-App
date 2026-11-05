"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export default function PushNotificationToggle() {
  const [supported, setSupported]   = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [vapidKey, setVapidKey]     = useState("");
  const [denied, setDenied]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    setDenied(Notification.permission === "denied");

    // Register SW immediately so .ready resolves when user clicks
    navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Fetch VAPID public key
    fetch("/api/push/subscribe")
      .then((r) => r.json())
      .then((d: { vapidPublicKey?: string }) => { if (d.vapidPublicKey) setVapidKey(d.vapidPublicKey); })
      .catch(() => {});

    // Check existing subscription
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  if (!supported || denied) return null;

  async function subscribe() {
    setError(null);
    if (!vapidKey) {
      // Key not loaded yet — retry fetch then proceed
      try {
        const d = await fetch("/api/push/subscribe").then((r) => r.json()) as { vapidPublicKey?: string };
        if (!d.vapidPublicKey) { setError("تعذّر تحميل مفتاح الإشعارات"); return; }
        setVapidKey(d.vapidPublicKey);
      } catch { setError("تعذّر الاتصال بالخادم"); return; }
    }

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setDenied(true); return; }

      // Ensure SW is registered before calling .ready
      await navigator.serviceWorker.register("/sw.js").catch(() => {});
      const reg = await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error("server error");
      setSubscribed(true);
    } catch (err) {
      console.error("[push] subscribe error:", err);
      setError("حدث خطأ أثناء تفعيل الإشعارات");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setError(null);
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setSubscribed(false); return; }
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
      setSubscribed(false);
    } catch (err) {
      console.error("[push] unsubscribe error:", err);
      setError("حدث خطأ أثناء إلغاء الإشعارات");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <button
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        aria-label={subscribed ? "إلغاء الإشعارات" : "تفعيل إشعارات FitZone"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: subscribed ? "rgba(233,30,99,.15)" : "rgba(255,255,255,.07)",
          border: `1px solid ${subscribed ? "rgba(233,30,99,.45)" : "rgba(255,255,255,.18)"}`,
          borderRadius: 9,
          padding: "7px 14px",
          fontSize: 13,
          fontWeight: 700,
          color: subscribed ? "#e91e63" : "#d7aabd",
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.65 : 1,
          transition: "all .2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 15 }}>{subscribed ? "🔔" : "🔕"}</span>
        {loading ? "..." : subscribed ? "إشعارات مفعّلة" : "فعّلي الإشعارات"}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "#f87171", paddingInlineStart: 4 }}>{error}</span>
      )}
    </div>
  );
}
