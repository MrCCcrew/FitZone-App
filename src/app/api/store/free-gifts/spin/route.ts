import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings, type RewardPoolItem } from "@/app/api/admin/store-free-gifts-game/route";

const COOKIE = "fitzone-game-token";

const FALLBACK_POOL: RewardPoolItem[] = [
  { id: "f1", labelAr: "هدية مجانية", labelEn: "Free Gift", type: "free_product", value: 0, weight: 30, active: true },
  { id: "f2", labelAr: "50 نقطة", labelEn: "50 Points", type: "points", value: 50, weight: 25, active: true },
  { id: "f3", labelAr: "شحن مجاني", labelEn: "Free Shipping", type: "free_shipping", value: 0, weight: 20, active: true },
  { id: "f4", labelAr: "خصم 10%", labelEn: "10% Discount", type: "discount", value: 10, weight: 15, active: true },
  { id: "f5", labelAr: "100 نقطة", labelEn: "100 Points", type: "points", value: 100, weight: 10, active: true },
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
  if (!settings.gameEnabled) return NextResponse.json({ error: "game_disabled" }, { status: 403 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  if (session.spinsDone >= settings.maxSpinsPerUser) return NextResponse.json({ error: "spin_limit_reached" }, { status: 429 });

  const { item, index } = pickByWeight(settings.rewardsPool);

  // Generate 3 card options for step 2
  const cardsData = Array.from({ length: 3 }, () => {
    const { item: c } = pickByWeight(settings.rewardsPool);
    return { type: c.type, value: c.value, labelAr: c.labelAr, revealed: false };
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
