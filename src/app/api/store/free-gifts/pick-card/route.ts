import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";
import { FREE_GIFTS_COOKIE, freeGiftsError, getFreeGiftsEligibility, isFreeGiftsSessionExpired } from "@/lib/store-free-gifts";

export async function POST(req: Request) {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) return freeGiftsError("game_disabled", 403, "لعبة الهدايا المجانية غير مفعلة حالياً.", "The free gifts game is not active right now.");

  const cookieStore = await cookies();
  const token = cookieStore.get(FREE_GIFTS_COOKIE)?.value;
  if (!token) return freeGiftsError("no_session", 400, "لا توجد جلسة لعب نشطة. أعيدي فتح اللعبة من البداية.", "There is no active game session. Please reopen the game and start again.");

  const body = await req.json() as { index?: number; cardIndex?: number };
  const cardIndex = body.index ?? body.cardIndex;
  if (typeof cardIndex !== "number") return freeGiftsError("invalid", 400, "الاختيار غير صالح. حاولي مرة أخرى.", "This selection is invalid. Please try again.");

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return freeGiftsError("invalid_session", 400, "هذه الجلسة لم تعد صالحة. ابدئي لعبة جديدة للمحاولة مرة أخرى.", "This session is no longer valid. Start a new game to try again.");
  if (isFreeGiftsSessionExpired(session)) {
    await dbx.storeFreeGiftsSession.update({ where: { id: session.id }, data: { status: "expired" } }).catch(() => {});
    return freeGiftsError("session_expired", 410, "انتهت مهلة اللعبة قبل اختيار الكارت. ابدئي من جديد.", "The game session expired before choosing a card. Please start again.");
  }
  const eligibility = await getFreeGiftsEligibility(session.userId ?? null);
  if (!eligibility.eligible) return freeGiftsError(eligibility.code, 403, eligibility.messageAr, eligibility.messageEn);
  if (session.step < 2) return freeGiftsError("wrong_step", 400, "لا يمكن اختيار كارت الآن لأن هذه المرحلة لم تبدأ بعد.", "You cannot pick a card yet because this stage has not started.");
  if (session.cardsDone >= settings.maxCardPicksPerUser) return freeGiftsError("picks_exhausted", 429, "لقد استخدمتِ جميع فرص اختيار الكروت المتاحة.", "You have already used all available card picks.");

  let cardsData: { type: string; icon?: string; value: number; labelAr: string; labelEn?: string; revealed: boolean }[] = [];
  try { cardsData = JSON.parse(session.cardsData); } catch { return freeGiftsError("cards_error", 500, "حدثت مشكلة أثناء تحميل الكروت. أعيدي المحاولة بعد قليل.", "There was a problem loading the cards. Please try again shortly."); }

  if (cardIndex < 0 || cardIndex >= cardsData.length) return freeGiftsError("invalid_index", 400, "هذا الكارت غير موجود أو غير متاح.", "This card does not exist or is not available.");
  if (cardsData[cardIndex].revealed) return freeGiftsError("already_revealed", 400, "تم فتح هذا الكارت بالفعل. اختاري كارتاً آخر إن وُجد.", "This card has already been revealed. Choose another one if available.");

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
    card: { type: picked.type, icon: picked.icon ?? "", value: picked.value, labelAr: picked.labelAr, labelEn: picked.labelEn ?? "" },
    advanceToStep3: advance,
    allCards: cardsData.map((c, i) => ({ index: i, revealed: c.revealed, ...(c.revealed ? { labelAr: c.labelAr, type: c.type } : {}) })),
  });
}
