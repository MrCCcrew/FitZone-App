import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";

const COOKIE = "fitzone-game-token";

async function getOrCreateSession(token: string | null, userId: string | null) {
  const dbx = db as any;
  if (token) {
    const s = await dbx.storeFreeGiftsSession.findUnique({ where: { token } }).catch(() => null);
    if (s && s.status === "active") {
      if (!s.userId && userId) await dbx.storeFreeGiftsSession.update({ where: { id: s.id }, data: { userId } }).catch(() => {});
      return s;
    }
  }
  // Create new session
  const settings = await getGameSettings();
  const expiresAt = settings.sessionDurationMinutes > 0
    ? new Date(Date.now() + settings.sessionDurationMinutes * 60_000) : null;
  const session = await dbx.storeFreeGiftsSession.create({
    data: { userId, giftSlotsCount: settings.freeGiftSlotsCount, expiresAt },
  });
  return session;
}

export async function GET(req: NextRequest) {
  try {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) return NextResponse.json({ gameEnabled: false });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value ?? null;
  const user = await getCurrentAppUser();
  const userId = user?.id ?? null;

  const dbx = db as any;
  let session: Awaited<ReturnType<typeof getOrCreateSession>>;
  try {
    session = await getOrCreateSession(token, userId);
  } catch (sessionErr) {
    console.error("[FREE_GIFTS_GAME] session error:", sessionErr);
    return NextResponse.json({ error: "session_error" }, { status: 500 });
  }

  // Eligible products (never send cost/price from admin-only fields)
  let eligibleProducts: { id: string; name: string; images: string | null; price: number; category: string }[] = [];
  try {
    const whereIds = settings.eligibleGiftProductIds.length > 0
      ? { id: { in: settings.eligibleGiftProductIds } } : {};
    eligibleProducts = await db.product.findMany({
      where: { isActive: true, stock: { gt: 0 }, deletedAt: null, ...whereIds },
      select: { id: true, name: true, images: true, price: true, category: true },
      take: 20,
    });
  } catch { eligibleProducts = []; }

  // Referral progress for invite panel
  let referralProgress = 0;
  let referralCode: string | null = null;
  if (userId) {
    const referral = await db.referral.findUnique({ where: { userId }, select: { code: true, usages: { select: { referredUserId: true } } } }).catch(() => null);
    if (referral) {
      referralCode = referral.code;
      referralProgress = referral.usages.length;
    }
  }

  // Parse stored cards (don't reveal unrevealed contents to client)
  let cardsForClient: { index: number; revealed: boolean; labelAr?: string; labelEn?: string; type?: string; icon?: string }[] = [];
  try {
    const cardsData = JSON.parse(session.cardsData) as { type: string; icon?: string; value: number; labelAr: string; labelEn?: string; revealed: boolean }[];
    cardsForClient = cardsData.map((c, i) => {
      const poolItem = settings.rewardsPool.find(r => r.type === c.type && r.labelAr === c.labelAr);
      return {
        index: i,
        revealed: c.revealed,
        ...(c.revealed ? { labelAr: c.labelAr, labelEn: c.labelEn ?? poolItem?.labelEn ?? c.labelAr, type: c.type, icon: c.icon ?? poolItem?.icon ?? "" } : {}),
      };
    });
  } catch { cardsForClient = []; }

  const selectedProductIds: string[] = (() => { try { return JSON.parse(session.selectedProductIds); } catch { return []; } })();

  const wheelSegments = settings.rewardsPool.filter(r => r.active).map(r => ({
    id: r.id, labelAr: r.labelAr, labelEn: r.labelEn ?? "", type: r.type, icon: r.icon ?? "",
  }));

  const baseUrl = (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://fitzoneland.com").replace(/\/$/, "");
  const referralLink = referralCode
    ? `${baseUrl}/r/${referralCode}`
    : null;

  const res = NextResponse.json({
    gameEnabled: true,
    token: session.token,
    step: session.step,
    spinDone: session.spinsDone > 0,
    spinResult: session.spinsDone > 0 ? (() => {
      const poolItem = settings.rewardsPool.find(r => r.type === session.spinRewardType && r.labelAr === session.spinLabelAr);
      return { labelAr: session.spinLabelAr, labelEn: poolItem?.labelEn ?? session.spinLabelAr ?? "", type: session.spinRewardType, value: session.spinRewardValue ?? 0 };
    })() : null,
    cardsDone: session.cardsDone,
    maxCardPicks: settings.maxCardPicksPerUser,
    cards: cardsForClient,
    selectedProductIds,
    giftSlotsCount: session.giftSlotsCount,
    expiresAt: session.expiresAt?.toISOString() ?? null,
    eligibleProducts,
    wheelSegments,
    referralProgress,
    referralGoal: settings.requiredInvites,
    referralLink,
  });
  res.cookies.set(COOKIE, session.token, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24, path: "/" });
  return res;
  } catch (err) {
    console.error("[FREE_GIFTS_GAME]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
