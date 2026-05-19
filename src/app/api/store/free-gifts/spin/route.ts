import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings, type RewardPoolItem } from "@/app/api/admin/store-free-gifts-game/route";
import { FREE_GIFTS_COOKIE, freeGiftsError, getFreeGiftsEligibility, isFreeGiftsSessionExpired } from "@/lib/store-free-gifts";

const FALLBACK_POOL: RewardPoolItem[] = [
  { id: "f1", labelAr: "هدية مجانية", labelEn: "Free Gift",      type: "free_product",  icon: "🎁", value: 0,   weight: 30, active: true },
  { id: "f2", labelAr: "50 نقطة",      labelEn: "50 Points",      type: "points",        icon: "⭐", value: 50,  weight: 25, active: true },
  { id: "f3", labelAr: "شحن مجاني",   labelEn: "Free Shipping",  type: "free_shipping", icon: "🚚", value: 0,   weight: 20, active: true },
  { id: "f4", labelAr: "خصم 10%",     labelEn: "10% Discount",   type: "discount",      icon: "🪙", value: 10,  weight: 15, active: true },
  { id: "f5", labelAr: "100 نقطة",     labelEn: "100 Points",     type: "points",        icon: "🏆", value: 100, weight: 10, active: true },
];

function pickByWeight(pool: RewardPoolItem[]): { item: RewardPoolItem; index: number } {
  const active = pool.filter(r => r.active);
  const src = active.length > 0 ? active : FALLBACK_POOL;
  const total = src.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < src.length; i++) {
    rand -= src[i].weight;
    if (rand <= 0) return { item: src[i], index: i };
  }
  return { item: src[src.length - 1], index: src.length - 1 };
}

export async function POST() {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) {
    return freeGiftsError("game_disabled", 403, "لعبة الهدايا المجانية غير مفعلة حالياً.", "The free gifts game is not active right now.");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(FREE_GIFTS_COOKIE)?.value;
  if (!token) {
    return freeGiftsError("no_session", 400, "لا توجد جلسة لعب نشطة. أعيدي فتح اللعبة من البداية.", "There is no active game session. Please reopen the game and start again.");
  }

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") {
    return freeGiftsError("invalid_session", 400, "هذه الجلسة لم تعد صالحة. ابدئي لعبة جديدة للمحاولة مرة أخرى.", "This session is no longer valid. Start a new game to try again.");
  }
  if (isFreeGiftsSessionExpired(session)) {
    await dbx.storeFreeGiftsSession.update({ where: { id: session.id }, data: { status: "expired" } }).catch(() => {});
    return freeGiftsError("session_expired", 410, "انتهت مهلة اللعبة قبل إكمال اللفة. ابدئي من جديد.", "The game session expired before completing the spin. Please start again.");
  }
  const eligibility = await getFreeGiftsEligibility(session.userId ?? null);
  if (!eligibility.eligible) {
    return freeGiftsError(eligibility.code, 403, eligibility.messageAr, eligibility.messageEn);
  }
  if (session.spinsDone >= settings.maxSpinsPerUser) {
    return freeGiftsError("spin_limit_reached", 429, "لقد استخدمتِ جميع فرص اللف المتاحة في هذه اللعبة.", "You have already used all available spins for this game.");
  }

  const { item, index } = pickByWeight(settings.rewardsPool);

  // Generate 3 card options for step 2
  const cardsData = Array.from({ length: 3 }, () => {
    const { item: c } = pickByWeight(settings.rewardsPool);
    return { type: c.type, icon: c.icon ?? "", value: c.value, labelAr: c.labelAr, labelEn: c.labelEn ?? "", revealed: false };
  });

  await dbx.storeFreeGiftsSession.update({
    where: { id: session.id },
    data: {
      spinsDone: { increment: 1 },
      spinRewardType: item.type,
      spinRewardValue: item.value,
      spinSlotIndex: index,
      spinLabelAr: item.labelAr,
      step: 2,
      cardsData: JSON.stringify(cardsData),
    },
  });

  return NextResponse.json({
    ok: true,
    reward: { type: item.type, value: item.value, labelAr: item.labelAr, labelEn: item.labelEn },
    slotIndex: index,
  });
}
