import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";
import { FREE_GIFTS_COOKIE, freeGiftsError, getFreeGiftsEligibility, isFreeGiftsSessionExpired } from "@/lib/store-free-gifts";

export async function POST() {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) return freeGiftsError("game_disabled", 403, "لعبة الهدايا المجانية غير مفعلة حالياً.", "The free gifts game is not active right now.");

  const cookieStore = await cookies();
  const token = cookieStore.get(FREE_GIFTS_COOKIE)?.value;
  if (!token) return freeGiftsError("no_session", 400, "لا توجد جلسة لعب نشطة. أعيدي فتح اللعبة من البداية.", "There is no active game session. Please reopen the game and start again.");

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return freeGiftsError("invalid_session", 400, "هذه الجلسة لم تعد صالحة. ابدئي لعبة جديدة للمحاولة مرة أخرى.", "This session is no longer valid. Start a new game to try again.");
  if (isFreeGiftsSessionExpired(session)) {
    await dbx.storeFreeGiftsSession.update({ where: { id: session.id }, data: { status: "expired" } }).catch(() => {});
    return freeGiftsError("session_expired", 410, "انتهت مهلة اللعبة قبل تأكيد الهدايا. ابدئي من جديد.", "The game session expired before confirming your gifts. Please start again.");
  }
  const eligibility = await getFreeGiftsEligibility(session.userId ?? null);
  if (!eligibility.eligible) return freeGiftsError(eligibility.code, 403, eligibility.messageAr, eligibility.messageEn);

  let selected: string[] = [];
  try { selected = JSON.parse(session.selectedProductIds); } catch { selected = []; }
  if (selected.length === 0) return freeGiftsError("no_products_selected", 400, "اختاري منتجاً واحداً على الأقل قبل تأكيد الهدايا.", "Select at least one product before confirming your gifts.");

  await dbx.storeFreeGiftsSession.update({
    where: { id: session.id },
    data: { status: "confirmed", confirmedAt: new Date() },
  });

  return NextResponse.json({ ok: true, selectedProductIds: selected });
}
