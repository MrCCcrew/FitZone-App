"use client";
import { useEffect, useState } from "react";

function useCountdown(expiresAt: string | null) {
  const [secs, setSecs] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecs(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return secs;
}

function fmt(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StoreGiftCountdown({ expiresAt }: { expiresAt: string | null }) {
  const secs = useCountdown(expiresAt);
  if (!expiresAt || secs === null) return null;

  const urgent = secs < 300; // under 5 min

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: urgent ? "rgba(239,68,68,.15)" : "rgba(255,255,255,.07)",
      border: `1px solid ${urgent ? "rgba(239,68,68,.4)" : "rgba(255,255,255,.12)"}`,
      borderRadius: 10,
      padding: "5px 12px",
      fontSize: 13,
      fontWeight: 800,
      color: urgent ? "#fca5a5" : "rgba(255,255,255,.6)",
      fontFamily: "Cairo,Tajawal,sans-serif",
      transition: "all .3s",
    }}>
      <span style={{ fontSize: 14 }}>⏱</span>
      {secs === 0 ? "انتهى الوقت" : fmt(secs)}
    </div>
  );
}
