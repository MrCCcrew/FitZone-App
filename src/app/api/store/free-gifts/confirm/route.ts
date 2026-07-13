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

  let selected: string[] = [];
  try { selected = JSON.parse(session.selectedProductIds); } catch { selected = []; }
  if (selected.length === 0) return NextResponse.json({ error: "no_products_selected" }, { status: 400 });

  const rewardType: string = session.spinRewardType ?? "free_product";
  const rewardValue: number = Number(session.spinRewardValue ?? 0);
  const userId: string | null = session.userId ?? null;

  // ── Deliver instant rewards (points / wallet) ──────────────────────────────
  if (userId) {
    try {
      if (rewardType === "points" && rewardValue > 0) {
        const rp = await db.rewardPoints.upsert({
          where: { userId },
          create: { userId, points: rewardValue, tier: "bronze" },
          update: { points: { increment: rewardValue } },
        });
        await db.rewardHistory.create({
          data: { rewardId: rp.id, points: rewardValue, reason: "free_gifts_game" },
        });
      } else if (rewardType === "wallet" && rewardValue > 0) {
        const wallet = await db.wallet.upsert({
          where: { userId },
          create: { userId, balance: rewardValue },
          update: { balance: { increment: rewardValue } },
        });
        await db.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: rewardValue,
            type: "credit",
            description: "هدية من لعبة الهدايا المجانية",
          },
        });
      }
    } catch (e) {
      console.error("[FREE_GIFTS_CONFIRM] reward delivery error:", e);
    }
  }

  // ── Mark session confirmed ──────────────────────────────────────────────────
  await dbx.storeFreeGiftsSession.update({
    where: { id: session.id },
    data: { status: "confirmed", confirmedAt: new Date() },
  });

  // Clear any admin override for this user — they've used their allowed replay
  if (userId) {
    const overrideRecord = await db.siteContent.findUnique({ where: { section: "gift_game_user_overrides" } }).catch(() => null);
    if (overrideRecord) {
      try {
        const overrides = JSON.parse(overrideRecord.content) as Record<string, string>;
        if (userId in overrides) {
          delete overrides[userId];
          await db.siteContent.update({
            where: { section: "gift_game_user_overrides" },
            data: { content: JSON.stringify(overrides) },
          });
        }
      } catch { /* noop */ }
    }
  }

  return NextResponse.json({ ok: true, selectedProductIds: selected, rewardType, rewardValue });
}
