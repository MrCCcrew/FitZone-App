import { db } from "@/lib/db";
import { getRewardSettings } from "@/lib/reward-settings";
import {
  postPromotionalPointsGrantJournal,
  postPromotionalWalletCreditJournal,
} from "@/lib/accounting-service";

type TransactionClient =
  Parameters<Parameters<typeof db.$transaction>[0]>[0];

export type StoreGiftRewardType =
  | "wallet"
  | "points"
  | "discount"
  | "free_product"
  | "free_shipping";

export type GrantStoreGiftInput = {
  userId: string;
  storeOrderId?: string | null;
  source: string;

  maxClaimsPerUser: number;

  rewardType: StoreGiftRewardType;
  rewardWalletAmount?: number;
  rewardPoints?: number;
  discountAmount?: number;
  rewardProductId?: string | null;
};

export type GrantStoreGiftResult =
  | {
      status: "claimed";
      claimId: string;
      rewardType: StoreGiftRewardType;
      rewardValue: number | null;
    }
  | {
      status: "earned";
      claimId: string;
      rewardType: StoreGiftRewardType;
      rewardValue: number | null;
    }
  | {
      status: "duplicate";
    }
  | {
      status: "limit_reached";
    };

let storeGiftRewardTestFailpoint:
  | "after_claim"
  | "after_wallet_balance"
  | "after_points_balance"
  | "after_gl"
  | null = null;

export function setStoreGiftRewardTestFailpoint(
  value: typeof storeGiftRewardTestFailpoint,
) {
  storeGiftRewardTestFailpoint = value;
}

function triggerStoreGiftRewardTestFailpoint(
  point: Exclude<typeof storeGiftRewardTestFailpoint, null>,
) {
  if (
    process.env.NODE_ENV === "test" &&
    storeGiftRewardTestFailpoint === point
  ) {
    throw new Error(
      `STORE_GIFT_REWARD_TEST_FAILPOINT:${point}`,
    );
  }
}

function normalizedRewardValue(
  input: GrantStoreGiftInput,
): number | null {
  if (input.rewardType === "wallet") {
    return Math.max(
      0,
      Number(input.rewardWalletAmount ?? 0),
    );
  }

  if (input.rewardType === "points") {
    return Math.max(
      0,
      Math.floor(
        Number(input.rewardPoints ?? 0),
      ),
    );
  }

  if (input.rewardType === "discount") {
    return Math.max(
      0,
      Number(input.discountAmount ?? 0),
    );
  }

  return null;
}

async function lockGiftUser(
  tx: TransactionClient,
  userId: string,
) {
  await tx.$queryRaw`
    SELECT id
    FROM User
    WHERE id = ${userId}
    FOR UPDATE
  `;
}

/**
 * Atomic Store Gift claim.
 *
 * claim
 * + wallet / points balance
 * + WalletTransaction / RewardHistory
 * + accounting journal
 * + claimed state
 *
 * are committed or rolled back together.
 */
export async function grantStoreGiftClaimAtomic(
  input: GrantStoreGiftInput,
): Promise<GrantStoreGiftResult> {
  const rewardValue =
    normalizedRewardValue(input);

  /*
   * Capture the current configured point value before
   * entering the DB transaction.
   *
   * The journal records the EGP liability value at
   * the moment the points are granted.
   */
  const rewardSettings =
    input.rewardType === "points"
      ? await getRewardSettings()
      : null;

  return db.$transaction(async (tx) => {
    await lockGiftUser(
      tx,
      input.userId,
    );

    if (input.storeOrderId) {
      const duplicate =
        await tx.storeGiftCampaignClaim.findFirst({
          where: {
            storeOrderId:
              input.storeOrderId,
          },
          select: {
            id: true,
          },
        });

      if (duplicate) {
        return {
          status: "duplicate",
        };
      }
    }

    const existingClaims =
      await tx.storeGiftCampaignClaim.count({
        where: {
          userId:
            input.userId,
          status: {
            in: [
              "earned",
              "claimed",
            ],
          },
        },
      });

    if (
      existingClaims >=
      Math.max(
        0,
        input.maxClaimsPerUser,
      )
    ) {
      return {
        status:
          "limit_reached",
      };
    }

    const claim =
      await tx.storeGiftCampaignClaim.create({
        data: {
          userId:
            input.userId,

          storeOrderId:
            input.storeOrderId ??
            null,

          rewardType:
            input.rewardType,

          rewardValue,

          rewardProductId:
            input.rewardProductId ??
            null,

          status: "earned",

          source:
            input.source,
        },
      });

    triggerStoreGiftRewardTestFailpoint(
      "after_claim",
    );

    // ─────────────────────────────────────────
    // WALLET REWARD
    // ─────────────────────────────────────────
    if (
      input.rewardType ===
        "wallet" &&
      rewardValue != null &&
      rewardValue > 0
    ) {
      const wallet =
        await tx.wallet.upsert({
          where: {
            userId:
              input.userId,
          },

          create: {
            userId:
              input.userId,

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

      triggerStoreGiftRewardTestFailpoint(
        "after_wallet_balance",
      );

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
              "مكافأة من حملة هدايا المتجر",
          },
        });

      await postPromotionalWalletCreditJournal(
        tx,
        walletTransaction.id,
        rewardValue,
      );

      triggerStoreGiftRewardTestFailpoint(
        "after_gl",
      );

      await tx.storeGiftCampaignClaim.update({
        where: {
          id: claim.id,
        },

        data: {
          status:
            "claimed",

          claimedAt:
            new Date(),
        },
      });

      return {
        status:
          "claimed",

        claimId:
          claim.id,

        rewardType:
          input.rewardType,

        rewardValue,
      };
    }

    // ─────────────────────────────────────────
    // POINTS REWARD
    // ─────────────────────────────────────────
    if (
      input.rewardType ===
        "points" &&
      rewardValue != null &&
      rewardValue > 0
    ) {
      const points =
        Math.floor(
          rewardValue,
        );

      const rp =
        await tx.rewardPoints.upsert({
          where: {
            userId:
              input.userId,
          },

          create: {
            userId:
              input.userId,

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

      triggerStoreGiftRewardTestFailpoint(
        "after_points_balance",
      );

      const rewardHistory =
        await tx.rewardHistory.create({
          data: {
            rewardId:
              rp.id,

            points,

            reason:
              "store_gift_campaign",
          },
        });

      const pointValueEGP =
        Number(
          rewardSettings?.pointValueEGP ??
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

      triggerStoreGiftRewardTestFailpoint(
        "after_gl",
      );

      await tx.storeGiftCampaignClaim.update({
        where: {
          id: claim.id,
        },

        data: {
          status:
            "claimed",

          claimedAt:
            new Date(),
        },
      });

      return {
        status:
          "claimed",

        claimId:
          claim.id,

        rewardType:
          input.rewardType,

        rewardValue:
          points,
      };
    }

    /*
     * Discount / free product / free shipping:
     * not an immediate monetary liability here.
     *
     * Keep the claim "earned" for its existing
     * fulfillment flow.
     */
    return {
      status:
        "earned",

      claimId:
        claim.id,

      rewardType:
        input.rewardType,

      rewardValue,
    };
  });
}
