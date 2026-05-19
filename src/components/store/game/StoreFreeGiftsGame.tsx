"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/language";
import { StoreGiftGameHeader } from "./StoreGiftGameHeader";
import { StoreGiftStepProgress } from "./StoreGiftStepProgress";
import { StoreFloatingGiftsBackground } from "./StoreFloatingGiftsBackground";
import { StoreConfettiLayer } from "./StoreConfettiLayer";
import { PremiumSpinWheel } from "./PremiumSpinWheel";
import { StoreRewardResultModal } from "./StoreRewardResultModal";
import { StorePickGiftCards } from "./StorePickGiftCards";
import { StoreBonusChest } from "./StoreBonusChest";
import { StoreFreeProductPicker } from "./StoreFreeProductPicker";
import { StoreGiftSlotsBar } from "./StoreGiftSlotsBar";
import { StoreInviteFriendsPanel } from "./StoreInviteFriendsPanel";
import { StoreGiftRulesModal } from "./StoreGiftRulesModal";
import { FitZoneBearMascot, type MascotState } from "./FitZoneBearMascot";

// ── Types ──────────────────────────────────────────────────────────────────
type WheelSegment = { id: string; labelAr: string; labelEn?: string; type: string; icon?: string };
type CardState    = { index: number; revealed: boolean; labelAr?: string; labelEn?: string; type?: string; icon?: string };
type Product      = { id: string; name: string; price: number; images: string | null; category?: string | null };

type GameState = {
  gameEnabled?: boolean;
  step: number;
  spinDone: boolean;
  spinResult: { type: string; value: number; labelAr: string; labelEn?: string } | null;
  cards: CardState[];
  maxCardPicks: number;
  cardsDone: number;
  selectedProductIds: string[];
  giftSlotsCount: number;
  eligibleProducts: Product[];
  wheelSegments: WheelSegment[];
  referralProgress: number;
  referralGoal: number;
  referralLink?: string | null;
  expiresAt: string | null;
};

// ── Main Component ──────────────────────────────────────────────────────────
export function StoreFreeGiftsGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [spinReward, setSpinReward] = useState<{ type: string; value: number; labelAr: string; labelEn?: string } | null>(null);
  const [showBonusChest, setShowBonusChest] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [mascotState, setMascotState] = useState<MascotState>("idle_chubby");
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;
  const confettiShownRef  = useRef(false);
  const pendingRewardRef  = useRef<{ type: string; value: number; labelAr: string; labelEn?: string } | null>(null);

  // ── Load game state ──
  const loadGame = useCallback(async () => {
    try {
      const res = await fetch("/api/store/free-gifts/game");
      if (!res.ok) throw new Error("failed");
      const data = await res.json() as GameState;
      if (data.gameEnabled === false) {
        setError(t("لعبة الهدايا غير مفعّلة حالياً.", "The gift game is not active right now."));
        return;
      }
      setGame(data);
    } catch {
      setError(t("تعذّر تحميل بيانات اللعبة.", "Failed to load game data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadGame(); }, [loadGame]);

  // ── Spin handler ──
  const handleSpin = async (): Promise<{ slotIndex: number }> => {
    setMascotState("spinning_excited");
    const res = await fetch("/api/store/free-gifts/spin", { method: "POST" });
    if (!res.ok) throw new Error("spin failed");
    const data = await res.json() as { reward: { type: string; value: number; labelAr: string }; slotIndex: number };
    pendingRewardRef.current = data.reward;
    return { slotIndex: data.slotIndex };
  };

  // Called by PremiumSpinWheel after animation + bounce complete
  const handleSpinAnimDone = () => {
    setMascotState("reward_happy");
    if (pendingRewardRef.current) {
      setSpinReward(pendingRewardRef.current);
      pendingRewardRef.current = null;
    }
  };

  const handleSpinRewardNext = async () => {
    setSpinReward(null);
    setMascotState("workout_transition");
    if (spinReward?.type === "bonus_chest") {
      setShowBonusChest(true);
      return;
    }
    await loadGame();
  };

  const handleBonusChestDone = async () => {
    setShowBonusChest(false);
    await loadGame();
  };

  // ── Card pick handler — returns card data; loadGame() called after animation ──
  const handlePickCard = async (index: number): Promise<{ card: { type: string; icon?: string; labelAr: string; labelEn?: string }; advanceToStep3: boolean }> => {
    const res = await fetch("/api/store/free-gifts/pick-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    if (!res.ok) throw new Error("pick failed");
    return res.json() as Promise<{ card: { type: string; icon?: string; labelAr: string; labelEn?: string }; advanceToStep3: boolean }>;
  };

  const handlePickComplete = async () => {
    setMascotState("fit_success");
    await loadGame();
  };

  // ── Product toggle handler ──
  const handleToggleProduct = async (productId: string) => {
    if (!game) return;
    const isSelected = game.selectedProductIds.includes(productId);
    const res = await fetch("/api/store/free-gifts/select-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, action: isSelected ? "remove" : "add" }),
    });
    if (!res.ok) return;
    const data = await res.json() as { selectedProductIds: string[] };
    setGame(prev => prev ? { ...prev, selectedProductIds: data.selectedProductIds } : prev);
  };

  // ── Confirm handler ──
  const handleConfirm = async () => {
    if (!game || confirming) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/store/free-gifts/confirm", { method: "POST" });
      if (!res.ok) throw new Error("confirm failed");
      if (!confettiShownRef.current) {
        confettiShownRef.current = true;
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
      setConfirmed(true);
    } finally {
      setConfirming(false);
    }
  };

  // ── Loading / Error ──
  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "rgba(255,255,255,.5)", fontFamily: "Cairo,Tajawal,sans-serif" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        <p>{t("جارٍ تحميل الهدايا...", "Loading gifts...")}</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#fca5a5", fontFamily: "Cairo,Tajawal,sans-serif" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <p>{error}</p>
        <button onClick={() => { setError(null); setLoading(true); void loadGame(); }} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, border: "none", background: "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "Cairo,Tajawal,sans-serif" }}>
          {t("أعيدي المحاولة", "Try again")}
        </button>
      </div>
    </div>
  );

  if (!game) return null;

  // ── Confirmed screen ──
  if (confirmed) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <StoreConfettiLayer active={showConfetti} />
      <div style={{ textAlign: "center", fontFamily: "Cairo,Tajawal,sans-serif" }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", marginBottom: 8 }}>{t("تم تأكيد هداياك!", "Your gifts are confirmed!")}</h2>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: 14, maxWidth: 300, margin: "0 auto 24px" }}>
          {t("هداياك المجانية سيتم إضافتها لطلبك عند إتمام عملية الشراء", "Your free gifts will be added to your order when you complete your purchase")}
        </p>
        <a href="/?page=shop" style={{ display: "inline-block", padding: "13px 36px", borderRadius: 12, background: "linear-gradient(135deg,#e91e63,#c2185b)", color: "#fff", fontSize: 15, fontWeight: 900, textDecoration: "none" }}>
          {t("عودي للمتجر ←", "Back to Store →")}
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "linear-gradient(160deg,#1a0010 0%,#2d0520 40%,#1a000c 100%)" }}>
      <StoreFloatingGiftsBackground />
      <StoreConfettiLayer active={showConfetti} />
      {showRules && <StoreGiftRulesModal onClose={() => setShowRules(false)} />}
      {spinReward && <StoreRewardResultModal reward={spinReward} onNext={() => void handleSpinRewardNext()} />}

      <div style={{ position: "relative", zIndex: 1, maxWidth: 540, margin: "0 auto" }}>
        {/* Header */}
        <StoreGiftGameHeader expiresAt={game.expiresAt} onRulesClick={() => setShowRules(true)} />

        {/* Step progress */}
        <StoreGiftStepProgress step={game.step} />

        {/* Content */}
        <div style={{ padding: "16px 16px 0" }}>

          {/* ─── STEP 1: Spin — Game Stage (wheel + mascot) ─── */}
          {game.step === 1 && (
            <>
              <style>{`
                @media (min-width: 640px) {
                  .fzgs-stage { flex-direction: row !important; align-items: center !important; }
                  .fzgs-bear  { order: 2; }
                  .fzgs-wheel { order: 1; flex: 1; }
                }
              `}</style>
              <div className="fzgs-stage" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                {/* Mascot — mobile: above wheel; desktop: right of wheel */}
                <div className="fzgs-bear" style={{ flexShrink:0 }}>
                  <FitZoneBearMascot state={mascotState} size="md" />
                </div>
                {/* Wheel */}
                <div className="fzgs-wheel" style={{ width:"100%" }}>
                  <PremiumSpinWheel
                    segments={game.wheelSegments}
                    onSpin={handleSpin}
                    onSpinComplete={handleSpinAnimDone}
                    disabled={game.spinDone}
                  />
                </div>
              </div>
            </>
          )}

          {/* Mascot mini — steps 2 & 3 */}
          {game.step >= 2 && !showBonusChest && (
            <div style={{ display:"flex", justifyContent:"center", marginBottom: 4 }}>
              <FitZoneBearMascot state={mascotState} size="sm" />
            </div>
          )}

          {/* ─── STEP 2: Cards ─── */}
          {game.step === 2 && !showBonusChest && (
            <StorePickGiftCards
              cards={game.cards}
              maxPicks={game.maxCardPicks}
              picksDone={game.cardsDone}
              onPick={handlePickCard}
              onPickComplete={handlePickComplete}
            />
          )}

          {/* Bonus chest overlay (step 2 transition) */}
          {showBonusChest && game.spinResult?.type === "bonus_chest" && (
            <StoreBonusChest
              labelAr={game.spinResult.labelAr}
              labelEn={game.spinResult.labelEn}
              onDone={() => void handleBonusChestDone()}
            />
          )}

          {/* ─── STEP 3: Products ─── */}
          {game.step === 3 && (
            <>
              {/* Spin reward summary */}
              {game.spinResult && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(251,191,36,.08)",
                  border: "1px solid rgba(251,191,36,.2)",
                  borderRadius: 12, padding: "10px 14px", marginBottom: 16,
                }}>
                  <span style={{ fontSize: 20 }}>🏆</span>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fde68a", fontFamily: "Cairo,Tajawal,sans-serif" }}>
                    {t("مكافأتك:", "Your reward:")} {lang === "en" && game.spinResult.labelEn ? game.spinResult.labelEn : game.spinResult.labelAr}
                  </p>
                </div>
              )}

              <StoreFreeProductPicker
                products={game.eligibleProducts}
                selected={game.selectedProductIds}
                slots={game.giftSlotsCount}
                onToggle={id => void handleToggleProduct(id)}
              />

              {/* Invite panel */}
              {game.referralGoal > 0 && (
                <StoreInviteFriendsPanel
                  referralProgress={game.referralProgress}
                  referralGoal={game.referralGoal}
                  referralLink={game.referralLink}
                />
              )}
            </>
          )}
        </div>

        {/* ─── Slots bar (step 3 only) ─── */}
        {game.step === 3 && (
          <StoreGiftSlotsBar
            slots={game.giftSlotsCount}
            selected={game.selectedProductIds}
            products={game.eligibleProducts}
            onConfirm={() => void handleConfirm()}
            confirming={confirming}
          />
        )}
      </div>
    </div>
  );
}
