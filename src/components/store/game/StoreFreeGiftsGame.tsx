"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StoreGiftGameHeader } from "./StoreGiftGameHeader";
import { StoreGiftStepProgress } from "./StoreGiftStepProgress";
import { StoreFloatingGiftsBackground } from "./StoreFloatingGiftsBackground";
import { StoreConfettiLayer } from "./StoreConfettiLayer";
import { StoreSpinWheel } from "./StoreSpinWheel";
import { StoreRewardResultModal } from "./StoreRewardResultModal";
import { StorePickGiftCards } from "./StorePickGiftCards";
import { StoreBonusChest } from "./StoreBonusChest";
import { StoreFreeProductPicker } from "./StoreFreeProductPicker";
import { StoreGiftSlotsBar } from "./StoreGiftSlotsBar";
import { StoreInviteFriendsPanel } from "./StoreInviteFriendsPanel";
import { StoreGiftRulesModal } from "./StoreGiftRulesModal";

// ── Types ──────────────────────────────────────────────────────────────────
type WheelSegment = { id: string; labelAr: string; type: string };
type CardState    = { index: number; revealed: boolean; labelAr?: string; type?: string };
type Product      = { id: string; name: string; price: number; images: string | null; category?: string | null };

type GameState = {
  step: number;
  spinDone: boolean;
  spinResult: { type: string; value: number; labelAr: string } | null;
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

  const [spinReward, setSpinReward] = useState<{ type: string; value: number; labelAr: string } | null>(null);
  const [showBonusChest, setShowBonusChest] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const confettiShownRef = useRef(false);

  // ── Load game state ──
  const loadGame = useCallback(async () => {
    try {
      const res = await fetch("/api/store/free-gifts/game");
      if (!res.ok) throw new Error("failed");
      const data = await res.json() as GameState;
      setGame(data);
    } catch {
      setError("تعذّر تحميل بيانات اللعبة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadGame(); }, [loadGame]);

  // ── Spin handler ──
  const handleSpin = async (): Promise<{ slotIndex: number }> => {
    const res = await fetch("/api/store/free-gifts/spin", { method: "POST" });
    if (!res.ok) throw new Error("spin failed");
    const data = await res.json() as { reward: { type: string; value: number; labelAr: string }; slotIndex: number };
    setSpinReward(data.reward);
    return { slotIndex: data.slotIndex };
  };

  const handleSpinRewardNext = async () => {
    setSpinReward(null);
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

  // ── Card pick handler ──
  const handlePickCard = async (index: number) => {
    const res = await fetch("/api/store/free-gifts/pick-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    if (!res.ok) throw new Error("pick failed");
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
        <p>جارٍ تحميل الهدايا...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#fca5a5", fontFamily: "Cairo,Tajawal,sans-serif" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <p>{error}</p>
        <button onClick={() => { setError(null); setLoading(true); void loadGame(); }} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, border: "none", background: "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "Cairo,Tajawal,sans-serif" }}>
          أعيدي المحاولة
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
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", marginBottom: 8 }}>تم تأكيد هداياك!</h2>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: 14, maxWidth: 300, margin: "0 auto 24px" }}>
          هداياك المجانية سيتم إضافتها لطلبك عند إتمام عملية الشراء
        </p>
        <a href="/store" style={{ display: "inline-block", padding: "13px 36px", borderRadius: 12, background: "linear-gradient(135deg,#f59e0b,#f97316)", color: "#fff", fontSize: 15, fontWeight: 900, textDecoration: "none" }}>
          عودي للمتجر ←
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "linear-gradient(180deg,#0d0020 0%,#080012 100%)" }}>
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

          {/* ─── STEP 1: Spin ─── */}
          {game.step === 1 && (
            <StoreSpinWheel
              segments={game.wheelSegments}
              onSpin={handleSpin}
              disabled={game.spinDone}
            />
          )}

          {/* ─── STEP 2: Cards ─── */}
          {game.step === 2 && !showBonusChest && (
            <StorePickGiftCards
              cards={game.cards}
              maxPicks={game.maxCardPicks}
              picksDone={game.cardsDone}
              onPick={handlePickCard}
            />
          )}

          {/* Bonus chest overlay (step 2 transition) */}
          {showBonusChest && game.spinResult?.type === "bonus_chest" && (
            <StoreBonusChest
              labelAr={game.spinResult.labelAr}
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
                    مكافأتك: {game.spinResult.labelAr}
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
