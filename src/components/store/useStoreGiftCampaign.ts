"use client";
import { useEffect, useState } from "react";

export type GiftCampaignData = {
  active: boolean;
  titleAr: string;
  minSubtotal: number;
  requiredReferrals: number;
  rewardType: string;
  rewardWalletAmount: number;
  rewardPoints: number;
  discountAmount: number;
  referralProgress: number;
  referralCode: string | null;
  alreadyClaimed: boolean;
  authenticated: boolean;
  endsAt: string | null;
};

const CACHE_KEY = "sgb-campaign-cache";
const CACHE_TTL = 5 * 60 * 1000;

function getCache(): GiftCampaignData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: GiftCampaignData; ts: number };
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function setGiftCampaignCache(data: GiftCampaignData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function useStoreGiftCampaign(): GiftCampaignData | null {
  const [campaign, setCampaign] = useState<GiftCampaignData | null>(null);

  useEffect(() => {
    const cached = getCache();
    if (cached) {
      setCampaign(cached);
      return;
    }
    fetch("/api/store/gift-campaign", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.active) {
          const data: GiftCampaignData = { ...d.settings, ...d, active: true };
          setGiftCampaignCache(data);
          setCampaign(data);
        }
      })
      .catch(() => {});
  }, []);

  return campaign;
}
