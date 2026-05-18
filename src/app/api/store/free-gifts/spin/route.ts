import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings, type RewardPoolItem } from "@/app/api/admin/store-free-gifts-game/route";

const COOKIE = "fitzone-game-token";

function pickByWeight(pool: RewardPoolItem[]): { item: RewardPoolItem; index: number } {
  const active = pool.filter(r => r.active);
  const total = active.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < active.length; i++) {
    rand -= active[i].weight;
    if (rand <= 0) return { item: active[i], index: i };
  }
  return { item: active[active.length - 1], index: active.length - 1 };
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

  // Generate card data for step 2 while we're here
  const activePool = settings.rewardsPool.filter(r => r.active);
  const cardsData = Array.from({ length: settings.maxCardPicksPerUser * 2 + 1 }, () => {
    const { item: c } = pickByWeight(activePool.length > 0 ? settings.rewardsPool : settings.rewardsPool);
    return { type: c.type, value: c.value, labelAr: c.labelAr, revealed: false };
  }).slice(0, 3);

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
