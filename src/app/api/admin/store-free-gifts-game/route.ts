import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

const SECTION = "store_free_gifts_game";

export type RewardPoolItem = {
  id: string;
  labelAr: string;
  labelEn: string;
  type: string;   // free text — admin can define any reward type
  icon: string;   // emoji shown in wheel/cards
  value: number;
  weight: number;
  active: boolean;
};

export type StoreFreeGiftsGameSettings = {
  gameEnabled: boolean;
  maxSpinsPerUser: number;
  maxCardPicksPerUser: number;
  freeGiftSlotsCount: number;
  allowBonusChest: boolean;
  requireInviteForBonus: boolean;
  requiredInvites: number;
  minStoreCartSubtotal: number;
  eligibleGiftProductIds: string[];
  sessionDurationMinutes: number;
  showCountdown: boolean;
  rewardsPool: RewardPoolItem[];
};

const DEFAULT: StoreFreeGiftsGameSettings = {
  gameEnabled: false,
  maxSpinsPerUser: 1,
  maxCardPicksPerUser: 1,
  freeGiftSlotsCount: 3,
  allowBonusChest: true,
  requireInviteForBonus: false,
  requiredInvites: 2,
  minStoreCartSubtotal: 0,
  eligibleGiftProductIds: [],
  sessionDurationMinutes: 60,
  showCountdown: false,
  rewardsPool: [
    { id: "r1", labelAr: "هدية مجانية",  labelEn: "Free Gift",       type: "free_product",  icon: "🎁", value: 0,   weight: 25, active: true },
    { id: "r2", labelAr: "50 فيتزونة",       labelEn: "50 Points",       type: "points",        icon: "⭐", value: 50,  weight: 22, active: true },
    { id: "r3", labelAr: "شحن مجاني",    labelEn: "Free Shipping",   type: "free_shipping", icon: "🚚", value: 0,   weight: 18, active: true },
    { id: "r4", labelAr: "خصم 10%",      labelEn: "10% Discount",    type: "discount",      icon: "🪙", value: 10,  weight: 15, active: true },
    { id: "r5", labelAr: "صندوق بونص",   labelEn: "Bonus Chest",     type: "bonus_chest",   icon: "💎", value: 0,   weight: 10, active: true },
    { id: "r6", labelAr: "100 فيتزونة",      labelEn: "100 Points",      type: "points",        icon: "🏆", value: 100, weight: 6,  active: true },
    { id: "r7", labelAr: "هدية إضافية",  labelEn: "Extra Gift",      type: "free_product",  icon: "🎀", value: 0,   weight: 3,  active: true },
    { id: "r8", labelAr: "50 ج.م رصيد", labelEn: "50 EGP Credit",   type: "wallet",        icon: "💳", value: 50,  weight: 1,  active: true },
  ],
};

export async function getGameSettings(): Promise<StoreFreeGiftsGameSettings> {
  const row = await db.siteContent.findUnique({ where: { section: SECTION } });
  if (!row?.content) return DEFAULT;
  try {
    const raw = JSON.parse(row.content) as Partial<StoreFreeGiftsGameSettings> & { enabled?: boolean };
    // backward compat: old saves used `enabled` instead of `gameEnabled`
    const merged = { ...DEFAULT, ...raw };
    if (!merged.gameEnabled && raw.enabled) merged.gameEnabled = true;
    return merged;
  }
  catch { return DEFAULT; }
}

export async function GET() {
  const { error } = await requireAdminFeature("store-free-gifts");
  if (error) return error;
  const settings = await getGameSettings();
  const dbx = db as any;
  const totalSessions = await dbx.storeFreeGiftsSession.count().catch(() => 0);
  const confirmedSessions = await dbx.storeFreeGiftsSession.count({ where: { status: "confirmed" } }).catch(() => 0);
  return NextResponse.json({ settings, stats: { totalSessions, confirmedSessions } });
}

export async function PUT(req: Request) {
  const { error } = await requireAdminFeature("store-free-gifts");
  if (error) return error;
  const body = await req.json() as StoreFreeGiftsGameSettings;
  await db.siteContent.upsert({
    where: { section: SECTION },
    create: { section: SECTION, content: JSON.stringify(body) },
    update: { content: JSON.stringify(body) },
  });
  return NextResponse.json({ ok: true });
}
