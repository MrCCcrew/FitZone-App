"use client";
import { useState } from "react";

const CSS = `
@keyframes sgb-copy-flash {
  0%{transform:scale(1)}
  40%{transform:scale(.93)}
  100%{transform:scale(1)}
}
@keyframes sgb-copy-tick {
  0%{opacity:0;transform:scale(0) rotate(-20deg)}
  60%{opacity:1;transform:scale(1.2) rotate(5deg)}
  100%{opacity:1;transform:scale(1) rotate(0deg)}
}
`;

type Props = {
  referralLink: string | null;
  progress: number;
  required: number;
  authenticated: boolean;
};

export function StoreGiftReferralCTA({ referralLink, progress, required, authenticated }: Props) {
  const [copied, setCopied] = useState(false);

  if (!authenticated || required <= 0) return null;

  const done = progress >= required;

  const copy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        marginTop: 10,
        padding: "10px 14px",
        borderRadius: 10,
        background: done ? "rgba(34,197,94,.07)" : "rgba(233,30,99,.05)",
        border: `1px solid ${done ? "rgba(34,197,94,.2)" : "rgba(233,30,99,.15)"}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {Array.from({ length: required }, (_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i < progress ? "#22c55e" : "rgba(0,0,0,.12)",
                transition: "background .3s",
              }}
            />
          ))}
        </div>

        {/* Text */}
        <span style={{ fontSize: 12, color: done ? "#16a34a" : "#7a5b68", flex: 1, lineHeight: 1.5 }}>
          {done
            ? "✅ وصلتِ لعدد الدعوات المطلوب!"
            : `ادعي ${required - progress} صديقة أخرى بالرابط — (${progress}/${required})`}
        </span>

        {/* Copy button */}
        {referralLink && !done && (
          <button
            onClick={copy}
            aria-label="نسخ رابط الدعوة"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1.5px solid rgba(233,30,99,.3)",
              background: copied ? "rgba(34,197,94,.12)" : "rgba(233,30,99,.07)",
              color: copied ? "#16a34a" : "#e91e63",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background .25s, color .25s, border-color .25s",
              animation: copied ? "sgb-copy-flash .3s ease-out" : "none",
              flexShrink: 0,
            }}
          >
            {copied ? (
              <>
                <span style={{ animation: "sgb-copy-tick .3s ease-out both" }}>✅</span>
                تم النسخ
              </>
            ) : (
              <>📋 انسخي الرابط</>
            )}
          </button>
        )}
      </div>
    </>
  );
}
