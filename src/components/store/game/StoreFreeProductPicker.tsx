"use client";

const CSS = `
@keyframes sfpp-card-in {
  from{opacity:0;transform:translateY(16px) scale(.96)}
  to{opacity:1;transform:translateY(0) scale(1)}
}
@keyframes sfpp-selected-pulse {
  0%,100%{box-shadow:0 0 0 2px rgba(249,115,22,.6)}
  50%{box-shadow:0 0 0 6px rgba(249,115,22,.2)}
}
@media(prefers-reduced-motion:reduce){
  .sfpp-card{animation:none!important}
  .sfpp-selected{animation:none!important}
}
`;

type Product = {
  id: string;
  name: string;
  price: number;
  images: string | null;
  category?: string | null;
};

type Props = {
  products: Product[];
  selected: string[];
  slots: number;
  onToggle: (id: string) => void;
};

export function StoreFreeProductPicker({ products, selected, slots, onToggle }: Props) {
  const remaining = slots - selected.length;

  const getImg = (p: Product) => {
    if (!p.images) return null;
    try {
      const imgs = JSON.parse(p.images);
      return Array.isArray(imgs) ? imgs[0] : null;
    } catch { return null; }
  };

  return (
    <>
      <style>{CSS}</style>
      <div>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24", marginBottom: 6, fontFamily: "Cairo,Tajawal,sans-serif" }}>
            🎁 اختاري هداياك المجانية
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", fontFamily: "Cairo,Tajawal,sans-serif" }}>
            {remaining > 0
              ? `تبقى لك ${remaining} ${remaining === 1 ? "هدية" : "هدايا"} — اختاري من المنتجات أدناه`
              : "اختياراتك مكتملة — اضغطي تأكيد"}
          </p>
        </div>

        {/* Product grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
          gap: 12,
          paddingBottom: 16,
        }}>
          {products.map((p, i) => {
            const img = getImg(p);
            const isSelected = selected.includes(p.id);
            const canSelect = isSelected || selected.length < slots;
            return (
              <div
                key={p.id}
                className={`sfpp-card${isSelected ? " sfpp-selected" : ""}`}
                onClick={() => canSelect && onToggle(p.id)}
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  border: isSelected
                    ? "2px solid #f97316"
                    : "1.5px solid rgba(255,255,255,.1)",
                  background: isSelected
                    ? "rgba(249,115,22,.1)"
                    : "rgba(255,255,255,.04)",
                  cursor: canSelect ? "pointer" : "not-allowed",
                  opacity: !canSelect ? 0.45 : 1,
                  transition: "all .2s",
                  animation: `sfpp-card-in .35s ease-out ${i * 0.04}s both${isSelected ? ",sfpp-selected-pulse 2s ease-in-out infinite" : ""}`,
                  position: "relative",
                }}
              >
                {/* Image */}
                <div style={{ width: "100%", aspectRatio: "1/1", background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                  {img
                    ? <img src={img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🎁</div>
                  }
                </div>
                {/* Info */}
                <div style={{ padding: "8px 10px 10px" }}>
                  <p style={{
                    fontSize: 12, fontWeight: 700, color: "#fff",
                    margin: 0, lineHeight: 1.4, fontFamily: "Cairo,Tajawal,sans-serif",
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {p.name}
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(249,115,22,.8)", margin: "4px 0 0", fontWeight: 800, fontFamily: "Cairo,Tajawal,sans-serif" }}>
                    مجاناً 🎁
                  </p>
                </div>
                {/* Selected badge */}
                {isSelected && (
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    width: 24, height: 24, borderRadius: "50%",
                    background: "#f97316",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 900, color: "#fff",
                    boxShadow: "0 2px 8px rgba(249,115,22,.5)",
                  }}>✓</div>
                )}
              </div>
            );
          })}
        </div>

        {products.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,.4)", fontFamily: "Cairo,Tajawal,sans-serif" }}>
            لا توجد منتجات متاحة حالياً
          </div>
        )}
      </div>
    </>
  );
}
