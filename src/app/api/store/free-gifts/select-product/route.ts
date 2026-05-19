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

  const { productId, action } = await req.json() as { productId: string; action: "add" | "remove" };

  const dbx = db as any;
  const session = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
  if (!session || session.status !== "active") return freeGiftsError("invalid_session", 400, "هذه الجلسة لم تعد صالحة. ابدئي لعبة جديدة للمحاولة مرة أخرى.", "This session is no longer valid. Start a new game to try again.");
  if (isFreeGiftsSessionExpired(session)) {
    await dbx.storeFreeGiftsSession.update({ where: { id: session.id }, data: { status: "expired" } }).catch(() => {});
    return freeGiftsError("session_expired", 410, "انتهت مهلة اللعبة قبل اختيار المنتجات. ابدئي من جديد.", "The game session expired before selecting products. Please start again.");
  }
  const eligibility = await getFreeGiftsEligibility(session.userId ?? null);
  if (!eligibility.eligible) return freeGiftsError(eligibility.code, 403, eligibility.messageAr, eligibility.messageEn);
  if (session.step < 3) return freeGiftsError("wrong_step", 400, "لا يمكن اختيار المنتجات الآن لأنكِ لم تصلي لهذه المرحلة بعد.", "You cannot select products yet because you have not reached this stage.");

  let selected: string[] = [];
  try { selected = JSON.parse(session.selectedProductIds); } catch { selected = []; }

  if (action === "remove") {
    selected = selected.filter(id => id !== productId);
  } else {
    if (selected.length >= session.giftSlotsCount) return freeGiftsError("slots_full", 400, "اكتملت كل خانات الهدايا المتاحة لكِ في هذه الجولة.", "All available gift slots for this round have been filled.");
    if (selected.includes(productId)) return NextResponse.json({ ok: true, selectedProductIds: selected });

    // Verify product is valid (active, in stock, eligible)
    const whereIds = settings.eligibleGiftProductIds.length > 0 ? { id: { in: settings.eligibleGiftProductIds } } : {};
    const product = await db.product.findFirst({
      where: { id: productId, isActive: true, stock: { gt: 0 }, deletedAt: null, ...whereIds },
      select: { id: true },
    });
    if (!product) return freeGiftsError("product_not_eligible", 400, "هذا المنتج غير متاح ضمن الهدايا المجانية أو نفدت كميته.", "This product is not available as a free gift or is out of stock.");
    selected.push(productId);
  }

  await dbx.storeFreeGiftsSession.update({ where: { id: session.id }, data: { selectedProductIds: JSON.stringify(selected) } });
  return NextResponse.json({ ok: true, selectedProductIds: selected });
}
