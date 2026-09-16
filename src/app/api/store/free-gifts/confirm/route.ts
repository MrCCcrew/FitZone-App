import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";
import { confirmFreeGiftSessionAtomic } from "@/lib/free-gift-reward-service";

const COOKIE = "fitzone-game-token";

export async function POST() {
  const settings =
    await getGameSettings();

  if (!settings.gameEnabled) {
    return NextResponse.json(
      { error: "game_disabled" },
      { status: 403 },
    );
  }

  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(COOKIE)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "no_session" },
      { status: 400 },
    );
  }

  try {
    const result =
      await confirmFreeGiftSessionAtomic(
        token,
      );

    // This override is administrative/UI state.
    // Reward + session confirmation have already committed atomically.
    if (result.userId) {
      try {
        const overrideRecord =
          await db.siteContent.findUnique({
            where: {
              section:
                "gift_game_user_overrides",
            },
          });

        if (overrideRecord) {
          const overrides =
            JSON.parse(
              overrideRecord.content,
            ) as Record<
              string,
              string
            >;

          if (
            result.userId in overrides
          ) {
            delete overrides[
              result.userId
            ];

            await db.siteContent.update({
              where: {
                section:
                  "gift_game_user_overrides",
              },
              data: {
                content:
                  JSON.stringify(
                    overrides,
                  ),
              },
            });
          }
        }
      } catch (error) {
        console.error(
          "[FREE_GIFTS_CONFIRM_OVERRIDE]",
          error,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      selectedProductIds:
        result.selectedProductIds,
      rewardType:
        result.rewardType,
      rewardValue:
        result.rewardValue,
    });
  } catch (error) {
    console.error(
      "[FREE_GIFTS_CONFIRM]",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message ===
      "FREE_GIFT_SESSION_NOT_FOUND"
    ) {
      return NextResponse.json(
        { error: "invalid_session" },
        { status: 400 },
      );
    }

    if (
      message ===
      "FREE_GIFT_SESSION_NOT_ACTIVE"
    ) {
      return NextResponse.json(
        { error: "invalid_session" },
        { status: 400 },
      );
    }

    if (
      message ===
      "FREE_GIFT_NO_PRODUCTS_SELECTED"
    ) {
      return NextResponse.json(
        { error: "no_products_selected" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          "reward_delivery_failed",
      },
      {
        status: 500,
      },
    );
  }
}
