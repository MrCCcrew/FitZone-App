import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";

const COOKIE = "fitzone-game-token";

export async function POST(req: Request) {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) return NextResponse.json({ error: "game_disabled" }, { status: 403 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const body = await req.json() as { index?: number; cardIndex?: number };
  const cardIndex = body.index ?? body.cardIndex;
  if (typeof cardIndex !== "number") return NextResponse.json({ error: "invalid" }, { status: 400 });

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  if (session.step < 2) return NextResponse.json({ error: "wrong_step" }, { status: 400 });
  if (session.cardsDone >= settings.maxCardPicksPerUser) return NextResponse.json({ error: "picks_exhausted" }, { status: 429 });

  let cardsData: { type: string; icon?: string; value: number; labelAr: string; revealed: boolean }[] = [];
  try { cardsData = JSON.parse(session.cardsData); } catch { return NextResponse.json({ error: "cards_error" }, { status: 500 }); }

  if (cardIndex < 0 || cardIndex >= cardsData.length) return NextResponse.json({ error: "invalid_index" }, { status: 400 });
  if (cardsData[cardIndex].revealed) return NextResponse.json({ error: "already_revealed" }, { status: 400 });

  cardsData[cardIndex].revealed = true;
  const picked = cardsData[cardIndex];
  const newPicksDone = session.cardsDone + 1;
  const advance = newPicksDone >= settings.maxCardPicksPerUser;

  await dbx.storeFreeGiftsSession.update({
    where: { id: session.id },
    data: {
      cardsDone: newPicksDone,
      cardsData: JSON.stringify(cardsData),
      ...(advance ? { step: 3 } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    card: { type: picked.type, icon: picked.icon ?? "", value: picked.value, labelAr: picked.labelAr },
    advanceToStep3: advance,
    allCards: cardsData.map((c, i) => ({ index: i, revealed: c.revealed, ...(c.revealed ? { labelAr: c.labelAr, type: c.type } : {}) })),
  });
}
