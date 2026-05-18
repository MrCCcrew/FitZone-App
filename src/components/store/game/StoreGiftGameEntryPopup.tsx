"use client";
import { useEffect, useState } from "react";

const SESSION_KEY = "fitzone-gift-game-popup-dismissed";

const CSS = `
@keyframes sgep-in {
  from{opacity:0;transform:translateY(60px) scale(.93)}
  to{opacity:1;transform:translateY(0) scale(1)}
}
@keyframes sgep-gift-bounce {
  0%,100%{transform:translateY(0) rotate(-4deg)}
  50%{transform:translateY(-10px) rotate(4deg)}
}
@keyframes sgep-shine {
  0%{background-position:-200% center}
  100%{background-position:200% center}
}
@media(prefers-reduced-motion:reduce){
  .sgep-card{animation:none!important}
  .sgep-gift{animation:none!important}
}
`;

export function StoreGiftGameEntryPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_KEY)) return;

    const check = async () => {
      try {
        const res = await fetch("/api/store/free-gifts/check");
        const { enabled } = await res.json() as { enabled: boolean };
        if (enabled) setTimeout(() => setShow(true), 1500);
      } catch { /* ignore */ }
    };

    void check();
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setShow(false);
  };

  const goPlay = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    window.location.href = "/store/free-gifts";
  };

  if (!show) return null;

  return (
    <>
      <style>{CSS}</style>
      {/* Overlay */}
      <div
        onClick={dismiss}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,.6)",
          backdropFilter: "blur(4px)",
          zIndex: 1200,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: "0 0 24px",
        }}
      >
        {/* Card */}
        <div
          className="sgep-card"
          onClick={e => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 420,
            background: "linear-gradient(145deg,#1a0030,#0d001a)",
            border: "1.5px solid rgba(233,30,99,.4)",
            borderRadius: "24px 24px 20px 20px",
            padding: "28px 24px 24px",
            animation: "sgep-in .45s cubic-bezier(.4,0,.2,1) both",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Shimmer strip */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: "linear-gradient(90deg,#e91e63,#c2185b,#f06292,#e91e63)",
            backgroundSize: "200% auto",
            animation: "sgep-shine 2s linear infinite",
          }} />

          {/* Emoji */}
          <div className="sgep-gift" style={{
            fontSize: 62, textAlign: "center", marginBottom: 12,
            animation: "sgep-gift-bounce 2s ease-in-out infinite",
            display: "block",
          }}>
            🎁
          </div>

          {/* Text */}
          <h2 style={{
            textAlign: "center", fontSize: 20, fontWeight: 900,
            color: "#fbbf24", margin: "0 0 8px",
            fontFamily: "Cairo,Tajawal,sans-serif",
          }}>
            عندك هدايا مجانية في انتظارك!
          </h2>
          <p style={{
            textAlign: "center", fontSize: 14,
            color: "rgba(255,255,255,.65)", margin: "0 0 24px",
            fontFamily: "Cairo,Tajawal,sans-serif", lineHeight: 1.7,
          }}>
            العبي عجلة الحظ، اختاري كارت، وخدي منتجات مجانية مع طلبك 🎰
          </p>

          {/* CTA button */}
          <button
            onClick={goPlay}
            style={{
              width: "100%", padding: "14px",
              borderRadius: 14, border: "none",
              background: "linear-gradient(135deg,#e91e63,#c2185b)",
              color: "#fff", fontSize: 16, fontWeight: 900,
              cursor: "pointer", fontFamily: "Cairo,Tajawal,sans-serif",
              boxShadow: "0 6px 24px rgba(233,30,99,.45)",
              marginBottom: 10,
            }}
          >
            🎰 ابدئي اللعبة الآن
          </button>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            style={{
              width: "100%", padding: "10px",
              borderRadius: 12, border: "1px solid rgba(255,255,255,.1)",
              background: "transparent",
              color: "rgba(255,255,255,.4)", fontSize: 13,
              cursor: "pointer", fontFamily: "Cairo,Tajawal,sans-serif",
            }}
          >
            لاحقاً
          </button>
        </div>
      </div>
    </>
  );
}
