"use client";

const CSS = `
@keyframes sgsb-slot-pop {
  0%{transform:scale(0);opacity:0}
  60%{transform:scale(1.2)}
  100%{transform:scale(1);opacity:1}
}
@keyframes sgsb-confirm-glow {
  0%,100%{box-shadow:0 0 0 0 rgba(233,30,99,0)}
  50%{box-shadow:0 0 0 8px rgba(233,30,99,.25)}
}
@media(prefers-reduced-motion:reduce){
  .sgsb-slot{animation:none!important}
  .sgsb-btn-ready{animation:none!important}
}
`;

type Product = { id: string; name: string; images: string | null };

type Props = {
  slots: number;
  selected: string[];
  products: Product[];
  onConfirm: () => void;
  confirming: boolean;
};

export function StoreGiftSlotsBar({ slots, selected, products, onConfirm, confirming }: Props) {
  const ready = selected.length >= slots;
  const remaining = slots - selected.length;

  const getImg = (id: string) => {
    const p = products.find(p => p.id === id);
    if (!p?.images) return null;
    try { const imgs = JSON.parse(p.images); return Array.isArray(imgs) ? imgs[0] : null; } catch { return null; }
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(180deg,transparent,rgba(26,0,12,.95) 20%,rgba(26,0,12,1))",
        padding: "16px 16px 20px",
        zIndex: 100,
        backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255,255,255,.08)",
      }}>
        {/* Slots row */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
          {Array.from({ length: slots }, (_, i) => {
            const pid = selected[i];
            const img = pid ? getImg(pid) : null;
            const filled = !!pid;
            return (
              <div
                key={i}
                className={filled ? "sgsb-slot" : ""}
                style={{
                  width: 52, height: 52, borderRadius: 10,
                  border: filled ? "2px solid #e91e63" : "2px dashed rgba(255,255,255,.2)",
                  background: filled ? "rgba(233,30,99,.12)" : "rgba(255,255,255,.04)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", flexShrink: 0,
                  animation: filled ? "sgsb-slot-pop .4s ease-out both" : "none",
                  position: "relative",
                }}
              >
                {filled ? (
                  img
                    ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 22 }}>🎁</span>
                ) : (
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.25)", fontWeight: 700 }}>#{i + 1}</span>
                )}
                {filled && (
                  <div style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}>✓</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          disabled={!ready || confirming}
          className={ready && !confirming ? "sgsb-btn-ready" : ""}
          style={{
            width: "100%", maxWidth: 400, display: "block", margin: "0 auto",
            padding: "14px", borderRadius: 14, border: "none",
            background: ready && !confirming
              ? "linear-gradient(135deg,#e91e63,#c2185b)"
              : "rgba(255,255,255,.08)",
            color: ready && !confirming ? "#fff" : "rgba(255,255,255,.3)",
            fontSize: 16, fontWeight: 900, cursor: ready && !confirming ? "pointer" : "not-allowed",
            fontFamily: "Cairo,Tajawal,sans-serif",
            boxShadow: ready ? "0 6px 24px rgba(233,30,99,.4)" : "none",
            animation: ready && !confirming ? "sgsb-confirm-glow 2s ease-in-out infinite" : "none",
            transition: "all .25s",
          }}
        >
          {confirming ? "⏳ جارٍ التأكيد..."
            : ready ? `✅ تأكيد ${slots} هدايا`
            : `اختاري ${remaining} ${remaining === 1 ? "هدية" : "هدايا"} أخرى`}
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 8, fontFamily: "Cairo,Tajawal,sans-serif" }}>
          يمكنك إكمال طلب المتجر بدون المشاركة في الهدايا
        </p>
      </div>
    </>
  );
}
