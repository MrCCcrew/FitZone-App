"use client";

import { useEffect, useState, useCallback } from "react";

interface CheckoutOptions {
  walletBalance: number;
  rewardPoints: number;
  pointValueEGP: number;
  rewardPointsEGP: number;
}

interface CheckoutBalanceSelectorProps {
  total: number;
  onChange: (walletDeduct: number, pointsDeduct: number, remaining: number) => void;
  lang?: "ar" | "en";
}

function fmt(n: number) {
  return new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function CheckoutBalanceSelector({ total, onChange, lang = "ar" }: CheckoutBalanceSelectorProps) {
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [useWallet, setUseWallet] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [pointsInput, setPointsInput] = useState("");

  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  useEffect(() => {
    fetch("/api/me/checkout-options", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: CheckoutOptions) => setOptions(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const compute = useCallback(
    (walletRaw: string, pointsRaw: string, walletOn: boolean, pointsOn: boolean) => {
      if (!options) return;
      let remaining = total;

      let walletDeduct = 0;
      if (walletOn) {
        const parsed = parseFloat(walletRaw);
        walletDeduct = Math.min(
          isNaN(parsed) || parsed <= 0 ? options.walletBalance : parsed,
          options.walletBalance,
          remaining,
        );
        walletDeduct = Math.round(walletDeduct * 100) / 100;
        remaining = Math.max(0, remaining - walletDeduct);
      }

      let pointsDeduct = 0;
      if (pointsOn) {
        const parsed = parseInt(pointsRaw, 10);
        const maxPointsByEGP = Math.floor(remaining / options.pointValueEGP);
        pointsDeduct = Math.min(
          isNaN(parsed) || parsed <= 0 ? options.rewardPoints : parsed,
          options.rewardPoints,
          maxPointsByEGP,
        );
        pointsDeduct = Math.max(0, pointsDeduct);
        remaining = Math.max(0, remaining - Math.round(pointsDeduct * options.pointValueEGP * 100) / 100);
      }

      onChange(walletDeduct, pointsDeduct, remaining);
    },
    [options, total, onChange],
  );

  useEffect(() => {
    compute(walletInput, pointsInput, useWallet, usePoints);
  }, [walletInput, pointsInput, useWallet, usePoints, compute]);

  if (loading || !options) return null;
  if (options.walletBalance <= 0 && options.rewardPoints <= 0) return null;

  const walletDeductPreview = (() => {
    if (!useWallet) return 0;
    const parsed = parseFloat(walletInput);
    return Math.round(Math.min(isNaN(parsed) || parsed <= 0 ? options.walletBalance : parsed, options.walletBalance, total) * 100) / 100;
  })();

  const pointsDeductPreview = (() => {
    if (!usePoints) return 0;
    const parsed = parseInt(pointsInput, 10);
    const afterWallet = Math.max(0, total - walletDeductPreview);
    const maxByEGP = Math.floor(afterWallet / options.pointValueEGP);
    return Math.min(isNaN(parsed) || parsed <= 0 ? options.rewardPoints : parsed, options.rewardPoints, maxByEGP);
  })();

  const pointsEGP = Math.round(pointsDeductPreview * options.pointValueEGP * 100) / 100;
  const remaining = Math.max(0, total - walletDeductPreview - pointsEGP);

  return (
    <div className="rounded-2xl border border-[#ffbcdb]/20 bg-[#2a0f1b]/80 p-4 space-y-3">
      <div className="text-sm font-bold text-[#ffd6e7]">
        {t("استخدم رصيدك للدفع", "Use your balance")}
      </div>

      {options.walletBalance > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useWallet}
              onChange={(e) => setUseWallet(e.target.checked)}
              className="accent-pink-500 w-4 h-4"
            />
            <span className="text-sm text-[#fff4f8]">
              {t("المحفظة", "Wallet")}
              <span className="mx-2 text-emerald-400 font-bold">{fmt(options.walletBalance)} {t("ج.م", "EGP")}</span>
            </span>
          </label>
          {useWallet && (
            <div className="mr-7">
              <input
                type="number"
                min={0.01}
                max={Math.min(options.walletBalance, total)}
                step={0.01}
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder={t("اتركه فارغاً لاستخدام كل الرصيد", "Leave empty to use full balance")}
                className="w-full rounded-xl border border-[#ffbcdb]/20 bg-[#3f1426] px-3 py-2 text-sm text-white outline-none focus:border-pink-400"
              />
              {walletDeductPreview > 0 && (
                <p className="mt-1 text-xs text-emerald-400">
                  {t(`سيُخصم ${fmt(walletDeductPreview)} ج.م`, `${fmt(walletDeductPreview)} EGP will be deducted`)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {options.rewardPoints > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usePoints}
              onChange={(e) => setUsePoints(e.target.checked)}
              className="accent-pink-500 w-4 h-4"
            />
            <span className="text-sm text-[#fff4f8]">
              {t("نقاط المكافآت", "Reward Points")}
              <span className="mx-2 text-yellow-400 font-bold">{options.rewardPoints.toLocaleString("ar-EG")} {t("نقطة", "pts")}</span>
              <span className="text-[#caa0b0] text-xs">= {fmt(options.rewardPointsEGP)} {t("ج.م", "EGP")}</span>
            </span>
          </label>
          {usePoints && (
            <div className="mr-7">
              <input
                type="number"
                min={1}
                max={options.rewardPoints}
                step={1}
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                placeholder={t("اتركه فارغاً لاستخدام كل النقاط", "Leave empty to use all points")}
                className="w-full rounded-xl border border-[#ffbcdb]/20 bg-[#3f1426] px-3 py-2 text-sm text-white outline-none focus:border-pink-400"
              />
              {pointsDeductPreview > 0 && (
                <p className="mt-1 text-xs text-yellow-400">
                  {t(
                    `سيُستخدم ${pointsDeductPreview.toLocaleString("ar-EG")} نقطة = ${fmt(pointsEGP)} ج.م`,
                    `${pointsDeductPreview} pts = ${fmt(pointsEGP)} EGP`,
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(walletDeductPreview > 0 || pointsDeductPreview > 0) && (
        <div className="rounded-xl border border-pink-400/20 bg-pink-500/10 px-4 py-3 space-y-1 text-sm">
          {walletDeductPreview > 0 && (
            <div className="flex justify-between text-[#fff4f8]">
              <span>{t("خصم المحفظة", "Wallet discount")}</span>
              <span className="text-emerald-400">- {fmt(walletDeductPreview)} {t("ج.م", "EGP")}</span>
            </div>
          )}
          {pointsDeductPreview > 0 && (
            <div className="flex justify-between text-[#fff4f8]">
              <span>{t("خصم النقاط", "Points discount")}</span>
              <span className="text-yellow-400">- {fmt(pointsEGP)} {t("ج.م", "EGP")}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-pink-400/20 pt-2 text-[#fff4f8]">
            <span>{t("المتبقي للدفع", "Remaining to pay")}</span>
            <span className={remaining <= 0 ? "text-emerald-400" : "text-white"}>
              {remaining <= 0 ? t("مجاناً ✓", "Free ✓") : `${fmt(remaining)} ${t("ج.م", "EGP")}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
