"use client";
import type { GiftCampaignData } from "./useStoreGiftCampaign";
import { StoreGiftBoxAnimation } from "./StoreGiftBoxAnimation";
import { StoreGiftProgressBar } from "./StoreGiftProgressBar";
import { StoreGiftReferralCTA } from "./StoreGiftReferralCTA";

const CSS = `
@keyframes sgb-card-in {
  from{transform:translateY(14px);opacity:0}
  to{transform:translateY(0);opacity:1}
}
@keyframes sgb-badge-pulse {
  0%,100%{box-shadow:0 0 0 0 rgba(233,30,99,.4)}
  50%{box-shadow:0 0 0 6px rgba(233,30,99,0)}
}
@media (prefers-reduced-motion:reduce){
  .sgb-card{animation:none!important}
}
`;

type CartItem = { price: number; qty: number };

type Props = {
  giftCampaign: GiftCampaignData | null;
  cartItems: CartItem[];
};

export function StoreGiftCampaignCard({ giftCampaign, cartItems }: Props) {
  if (!giftCampaign || !giftCampaign.active) return null;

  const cartSubtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const pct = Math.min(100, Math.round((cartSubtotal / Math.max(1, giftCampaign.minSubtotal)) * 100));
  const remaining = Math.max(0, giftCampaign.minSubtotal - cartSubtotal);
  const unlocked = cartSubtotal >= giftCampaign.minSubtotal;

  const rewardLabel =
    giftCampaign.rewardType === "wallet" ? `${giftCampaign.rewardWalletAmount} ج.م رصيد`
    : giftCampaign.rewardType === "points" ? `${giftCampaign.rewardPoints} نقطة`
    : giftCampaign.rewardType === "discount" ? `خصم ${giftCampaign.discountAmount} ج.م`
    : giftCampaign.rewardType === "free_shipping" ? "شحن مجاني"
    : "منتج مجاني";

  const referralLink = giftCampaign.referralCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${giftCampaign.referralCode}`
    : null;

  // Determine card state
  const isClaimed = giftCampaign.alreadyClaimed;

  // Case هـ: already claimed — stable view, no animation re-run
  if (isClaimed) {
    return (
      <>
        <style>{CSS}</style>
        <div style={{
          marginTop: 16,
          borderRadius: 16,
          border: "1.5px solid rgba(34,197,94,.3)",
          background: "rgba(34,197,94,.05)",
          padding: 18,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <StoreGiftBoxAnimation pct={100} alreadyClaimed size={64} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, color: "#22c55e" }}>
              هديتك مضافة مع طلب المتجر ✅
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
              {rewardLabel} سيُضاف تلقائياً عند تأكيد طلبك
            </div>
          </div>
        </div>
      </>
    );
  }

  // State أ: campaign not active → don't render (caught by parent)
  // State ب/ج/د: locked, near, unlocked
  const cardBorderColor = unlocked ? "rgba(34,197,94,.4)" : pct > 50 ? "rgba(233,30,99,.5)" : "rgba(233,30,99,.22)";
  const cardBg = unlocked ? "rgba(34,197,94,.04)" : pct > 50 ? "rgba(233,30,99,.06)" : "rgba(233,30,99,.03)";

  return (
    <>
      <style>{CSS}</style>
      <div
        className="sgb-card"
        style={{
          marginTop: 16,
          borderRadius: 16,
          border: `1.5px solid ${cardBorderColor}`,
          background: cardBg,
          padding: 18,
          animation: "sgb-card-in .4s cubic-bezier(.4,0,.2,1) both",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <StoreGiftBoxAnimation pct={pct} size={72} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ fontWeight: 900, fontSize: 14, color: unlocked ? "#22c55e" : "#1a0812", lineHeight: 1.4 }}>
              {unlocked
                ? "تم فتح هدية المتجر 🎉"
                : cartSubtotal === 0
                  ? "ابدئي التسوق وافتحي هدية المتجر 🎁"
                  : pct >= 70
                    ? "قربتِ جداً من الهدية! 🔥"
                    : giftCampaign.titleAr}
            </div>

            {/* Subtitle / reward */}
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
              {unlocked
                ? `الهدية: ${rewardLabel} — تُضاف تلقائياً عند تأكيد الطلب`
                : remaining > 0
                  ? `باقي ${remaining.toLocaleString("ar-EG")} ج.م من منتجات المتجر`
                  : "وصلتِ للحد الأدنى!"}
            </div>

            {/* Expiry */}
            {giftCampaign.endsAt && (
              <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginTop: 4 }}>
                ⏰ تنتهي الحملة: {new Date(giftCampaign.endsAt).toLocaleDateString("ar-EG")}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {!unlocked && cartItems.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <StoreGiftProgressBar
              current={cartSubtotal}
              target={giftCampaign.minSubtotal}
              rewardLabel={rewardLabel}
            />
          </div>
        )}

        {unlocked && (
          <div style={{ marginBottom: 12 }}>
            <StoreGiftProgressBar
              current={cartSubtotal}
              target={giftCampaign.minSubtotal}
              rewardLabel={rewardLabel}
            />
          </div>
        )}

        {/* Referral CTA */}
        {giftCampaign.requiredReferrals > 0 && (
          <StoreGiftReferralCTA
            referralLink={referralLink}
            progress={giftCampaign.referralProgress}
            required={giftCampaign.requiredReferrals}
            authenticated={giftCampaign.authenticated}
          />
        )}

        {/* Footer note */}
        <p style={{ fontSize: 11, color: "#b090a0", marginTop: 10, lineHeight: 1.6 }}>
          {unlocked
            ? "يمكنك إكمال الطلب بدون أي إجراء إضافي."
            : "يمكنك إكمال طلب المتجر بدون الهدية في أي وقت."}
        </p>
      </div>
    </>
  );
}
