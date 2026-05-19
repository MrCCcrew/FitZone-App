import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const FREE_GIFTS_COOKIE = "fitzone-game-token";

export type FreeGiftsErrorCode =
  | "game_disabled"
  | "no_session"
  | "invalid_session"
  | "session_expired"
  | "already_claimed_before"
  | "spin_limit_reached"
  | "wrong_step"
  | "picks_exhausted"
  | "already_revealed"
  | "cards_error"
  | "invalid"
  | "invalid_index"
  | "slots_full"
  | "product_not_eligible"
  | "no_products_selected";

type FreeGiftsErrorPayload = {
  error: FreeGiftsErrorCode;
  messageAr: string;
  messageEn: string;
};

export function freeGiftsError(
  error: FreeGiftsErrorCode,
  status: number,
  messageAr: string,
  messageEn: string,
) {
  return NextResponse.json({ error, messageAr, messageEn } satisfies FreeGiftsErrorPayload, { status });
}

export async function getFreeGiftsEligibility(userId: string | null) {
  if (!userId) return { eligible: true as const };

  try {
    const claimedBefore = await (db as any).storeFreeGiftsSession.count({
      where: {
        userId,
        status: "confirmed",
      },
    });

    if (claimedBefore > 0) {
      return {
        eligible: false as const,
        code: "already_claimed_before" as const,
        messageAr: "لقد استفدتِ من لعبة الهدايا المجانية من قبل، ولا يمكن المشاركة أكثر من مرة بنفس الحساب.",
        messageEn: "You have already used the free gifts game before, and this account cannot participate more than once.",
      };
    }
  } catch {
    // If the table is temporarily unavailable, don't block the game entirely.
  }

  return { eligible: true as const };
}

export function isFreeGiftsSessionExpired(session: { expiresAt?: Date | string | null }) {
  if (!session.expiresAt) return false;
  const expiresAt = session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
}
