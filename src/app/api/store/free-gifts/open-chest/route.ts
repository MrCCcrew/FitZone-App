import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";

const COOKIE = "fitzone-game-token";

export async function POST() {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) return NextResponse.json({ error: "game_disabled" }, { status: 403 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  if (session.spinRewardType !== "bonus_chest") return NextResponse.json({ error: "not_a_chest" }, { status: 400 });

  // Extra slots = spinRewardValue (default 1)
  const extraSlots = Math.max(1, Math.round(Number(session.spinRewardValue ?? 1)));
  const newSlotsCount = (session.giftSlotsCount ?? 0) + extraSlots;

  await dbx.storeFreeGiftsSession.update({
    where: { id: session.id },
    data: { giftSlotsCount: newSlotsCount },
  });

  return NextResponse.json({ ok: true, giftSlotsCount: newSlotsCount });
}
