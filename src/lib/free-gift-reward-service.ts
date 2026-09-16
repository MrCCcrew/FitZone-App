import { db } from "@/lib/db";
import { getRewardSettings } from "@/lib/reward-settings";
import {
  postPromotionalPointsGrantJournal,
  postPromotionalWalletCreditJournal,
} from "@/lib/accounting-service";

type TransactionClient =
  Parameters<Parameters<typeof db.$transaction>[0]>[0];

export type FreeGiftRewardResult = {
  sessionId: string;
  selectedProductIds: string[];
  rewardType: string;
  rewardValue: number;
  userId: string | null;
};

let freeGiftRewardTestFailpoint:
  | "after_reward"
  | "after_gl"
  | "before_confirm"
  | null = null;

export function setFreeGiftRewardTestFailpoint(
  value: typeof freeGiftRewardTestFailpoint,
) {
  freeGiftRewardTestFailpoint = value;
}

function triggerFreeGiftRewardTestFailpoint(
  point: Exclude<
    typeof freeGiftRewardTestFailpoint,
    null
  >,
) {
  if (
    process.env.NODE_ENV === "test" &&
    freeGiftRewardTestFailpoint === point
  ) {
    throw new Error(
      `FREE_GIFT_REWARD_TEST_FAILPOINT:${point}`,
    );
  }
}

async function lockSession(
  tx: TransactionClient,
  token: string,
) {
  await tx.$queryRaw`
    SELECT id
    FROM StoreFreeGiftsSession
    WHERE token = ${token}
    FOR UPDATE
  `;
}

/**
 * Confirm Free Gifts session atomically.
 *
 * For wallet/points rewards:
 *
 * reward balance
 * + WalletTransaction / RewardHistory
 * + promotional GL journal
 * + session confirmation
 *
 * all commit or roll back together.
 */
export async function confirmFreeGiftSessionAtomic(
  token: string,
): Promise<FreeGiftRewardResult> {
  /*
   * Capture reward settings before entering
   * the DB transaction.
   *
   * Only point rewards use pointValueEGP.
   * We don't yet know rewardType until the
   * session is locked/read, so reading once
   * here keeps config I/O outside the tx.
   */
  const rewardSettings =
    await getRewardSettings();

  return db.$transaction(async (tx) => {
    await lockSession(
      tx,
      token,
    );

    const session =
      await tx.storeFreeGiftsSession.findUnique({
        where: {
          token,
        },
      });

    if (!session) {
      throw new Error(
        "FREE_GIFT_SESSION_NOT_FOUND",
      );
    }

    if (
      session.status !==
      "active"
    ) {
      throw new Error(
        "FREE_GIFT_SESSION_NOT_ACTIVE",
      );
    }

    let selectedProductIds:
      string[] = [];

    try {
      const parsed =
        JSON.parse(
          session.selectedProductIds,
        );

      selectedProductIds =
        Array.isArray(parsed)
          ? parsed.filter(
              (
                value,
              ): value is string =>
                typeof value ===
                "string",
            )
          : [];
    } catch {
      selectedProductIds =
        [];
    }

    if (
      selectedProductIds.length ===
      0
    ) {
      throw new Error(
        "FREE_GIFT_NO_PRODUCTS_SELECTED",
      );
    }

    const rewardType =
      session.spinRewardType ??
      "free_product";

    const rewardValue =
      Math.max(
        0,
        Number(
          session.spinRewardValue ??
            0,
        ),
      );

    const userId =
      session.userId ??
      null;

    // ──────────────────────────────────────
    // POINTS REWARD
    // ──────────────────────────────────────
    if (
      userId &&
      rewardType ===
        "points" &&
      rewardValue > 0
    ) {
      const points =
        Math.floor(
          rewardValue,
        );

      const rp =
        await tx.rewardPoints.upsert({
          where: {
            userId,
          },

          create: {
            userId,
            points,
            tier:
              "bronze",
          },

          update: {
            points: {
              increment:
                points,
            },
          },
        });

      const rewardHistory =
        await tx.rewardHistory.create({
          data: {
            rewardId:
              rp.id,

            points,

            reason:
              "free_gifts_game",
          },
        });

      /*
       * Existing failpoint preserved.
       * At this point balance + history
       * exist inside the transaction,
       * but GL has not yet been posted.
       */
      triggerFreeGiftRewardTestFailpoint(
        "after_reward",
      );

      const pointValueEGP =
        Number(
          rewardSettings.pointValueEGP ??
            0,
        );

      const pointsLiabilityAmount =
        Math.round(
          points *
            pointValueEGP *
            100,
        ) / 100;

      await postPromotionalPointsGrantJournal(
        tx,
        rewardHistory.id,
        pointsLiabilityAmount,
      );

      triggerFreeGiftRewardTestFailpoint(
        "after_gl",
      );
    }

    // ──────────────────────────────────────
    // WALLET REWARD
    // ──────────────────────────────────────
    else if (
      userId &&
      rewardType ===
        "wallet" &&
      rewardValue > 0
    ) {
      const wallet =
        await tx.wallet.upsert({
          where: {
            userId,
          },

          create: {
            userId,
            balance:
              rewardValue,
          },

          update: {
            balance: {
              increment:
                rewardValue,
            },
          },
        });

      const walletTransaction =
        await tx.walletTransaction.create({
          data: {
            walletId:
              wallet.id,

            amount:
              rewardValue,

            type:
              "credit",

            description:
              "هدية من لعبة الهدايا المجانية",
          },
        });

      /*
       * Existing failpoint preserved.
       * Balance + WalletTransaction exist
       * inside tx but GL not posted yet.
       */
      triggerFreeGiftRewardTestFailpoint(
        "after_reward",
      );

      await postPromotionalWalletCreditJournal(
        tx,
        walletTransaction.id,
        rewardValue,
      );

      triggerFreeGiftRewardTestFailpoint(
        "after_gl",
      );
    }

    /*
     * This failpoint verifies that even after
     * the full reward + GL posting succeeds,
     * a failure before confirmation rolls
     * everything back.
     */
    triggerFreeGiftRewardTestFailpoint(
      "before_confirm",
    );

    await tx.storeFreeGiftsSession.update({
      where: {
        id: session.id,
      },

      data: {
        status:
          "confirmed",

        confirmedAt:
          new Date(),
      },
    });

    return {
      sessionId:
        session.id,

      selectedProductIds,

      rewardType,

      rewardValue,

      userId,
    };
  });
}
