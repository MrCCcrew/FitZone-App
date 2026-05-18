"use client";
import { StoreGiftCountdown } from "./StoreGiftCountdown";

type Props = {
  expiresAt: string | null;
  onRulesClick: () => void;
};

export function StoreGiftGameHeader({ expiresAt, onRulesClick }: Props) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px 10px",
      flexWrap: "wrap",
      gap: 10,
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 22 }}>🎰</span>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#fbbf24", lineHeight: 1.2, fontFamily: "Cairo,Tajawal,sans-serif" }}>
            FitZone Store
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.4)", fontFamily: "Cairo,Tajawal,sans-serif" }}>
            هدايا مجانية
          </p>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StoreGiftCountdown expiresAt={expiresAt} />
        <button
          onClick={onRulesClick}
          style={{
            padding: "5px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.06)",
            color: "rgba(255,255,255,.6)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "Cairo,Tajawal,sans-serif",
          }}
        >
          📋 القواعد
        </button>
        <a
          href="/store"
          style={{
            padding: "5px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.06)",
            color: "rgba(255,255,255,.6)",
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
            fontFamily: "Cairo,Tajawal,sans-serif",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← المتجر
        </a>
      </div>
    </div>
  );
}
