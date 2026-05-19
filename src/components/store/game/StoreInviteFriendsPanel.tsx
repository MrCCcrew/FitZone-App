"use client";
import { useState } from "react";
import { useLang } from "@/lib/language";

const CSS = `
@keyframes sifp-dot-pop {
  0%{transform:scale(0)}
  70%{transform:scale(1.25)}
  100%{transform:scale(1)}
}
@keyframes sifp-copy-flash {
  0%{opacity:1}
  50%{opacity:.4}
  100%{opacity:1}
}
@media(prefers-reduced-motion:reduce){
  .sifp-dot{animation:none!important}
}
`;

type Props = {
  referralProgress: number;
  referralGoal: number;
  referralLink?: string | null;
};

export function StoreInviteFriendsPanel({ referralProgress, referralGoal, referralLink }: Props) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const [copied, setCopied] = useState(false);
  const done = Math.min(referralProgress, referralGoal);
  const pct = referralGoal > 0 ? done / referralGoal : 0;

  const handleCopy = () => {
    if (!referralLink) return;
    void navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const progressText = lang === "ar"
    ? `${done} من ${referralGoal} صديقة وافقت`
    : `${done} of ${referralGoal} friends joined`;

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        background: "rgba(139,92,246,.1)",
        border: "1px solid rgba(139,92,246,.3)",
        borderRadius: 18,
        padding: "20px 20px 22px",
        marginTop: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>👯‍♀️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "#c4b5fd", fontFamily: "Cairo,Tajawal,sans-serif" }}>
              {t("ادعي صديقاتك واحصلي على هدايا أكثر", "Invite friends and earn more gifts")}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.5)", fontFamily: "Cairo,Tajawal,sans-serif" }}>
              {progressText}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
          {Array.from({ length: referralGoal }, (_, i) => (
            <div
              key={i}
              className={i < done ? "sifp-dot" : ""}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: i < done
                  ? "linear-gradient(135deg,#8b5cf6,#6d28d9)"
                  : "rgba(255,255,255,.08)",
                border: i < done ? "2px solid #a78bfa" : "2px solid rgba(255,255,255,.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14,
                animation: i < done ? `sifp-dot-pop .35s ease-out ${i * 0.08}s both` : "none",
                transition: "all .3s",
              }}
            >
              {i < done ? "✓" : <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{i + 1}</span>}
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 6, height: 6, overflow: "hidden", marginBottom: 16 }}>
          <div style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: "linear-gradient(90deg,#8b5cf6,#a855f7)",
            borderRadius: 6,
            transition: "width .6s ease",
          }} />
        </div>

        {referralLink && (
          <button
            onClick={handleCopy}
            style={{
              width: "100%",
              padding: "11px",
              borderRadius: 12,
              border: "1.5px solid rgba(139,92,246,.5)",
              background: "rgba(139,92,246,.15)",
              color: copied ? "#6ee7b7" : "#c4b5fd",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "Cairo,Tajawal,sans-serif",
              animation: copied ? "sifp-copy-flash .4s ease" : "none",
              transition: "color .2s",
            }}
          >
            {copied ? t("✅ تم النسخ!", "✅ Copied!") : t("📋 انسخي رابط الدعوة", "📋 Copy invite link")}
          </button>
        )}

        {pct >= 1 && (
          <p style={{ textAlign: "center", fontSize: 12, color: "#6ee7b7", marginTop: 10, fontWeight: 700, fontFamily: "Cairo,Tajawal,sans-serif" }}>
            {t("🎉 أكملت هدف الدعوة — مكافأتك جاهزة!", "🎉 Invite goal complete — your reward is ready!")}
          </p>
        )}
      </div>
    </>
  );
}
