import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

let db:
  typeof import("@/lib/db").db;

let grantStoreGiftClaimAtomic:
  typeof import("@/lib/store-gift-reward-service").grantStoreGiftClaimAtomic;

let setStoreGiftRewardTestFailpoint:
  typeof import("@/lib/store-gift-reward-service").setStoreGiftRewardTestFailpoint;

const userIds =
  new Set<string>();

let sequence = 0;

function testDatabaseUrl() {
  const value =
    process.env.TEST_DATABASE_URL;

  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required for store gift integration tests.",
    );
  }

  const url =
    new URL(value);

  const database =
    decodeURIComponent(
      url.pathname.replace(
        /^\//,
        "",
      ),
    );

  if (
    database !==
    "fitzone_test"
  ) {
    throw new Error(
      "Store gift integration tests require fitzone_test.",
    );
  }

  return value;
}

beforeAll(async () => {
  process.env.DATABASE_URL =
    testDatabaseUrl();

  if (
    process.env.NODE_ENV !==
    "test"
  ) {
    throw new Error(
      "Store gift integration tests require NODE_ENV=test.",
    );
  }

  ({
    db,
  } = await import("@/lib/db"));

  ({
    grantStoreGiftClaimAtomic,
    setStoreGiftRewardTestFailpoint,
  } = await import(
    "@/lib/store-gift-reward-service"
  ));
});

afterEach(async () => {
  if (
    setStoreGiftRewardTestFailpoint
  ) {
    setStoreGiftRewardTestFailpoint(
      null,
    );
  }

  for (
    const userId of userIds
  ) {
    /*
     * Journals reference WalletTransaction/
     * RewardHistory but are not necessarily
     * FK-cascaded by user deletion, so remove
     * our test journals first.
     */

    const wallet =
      await db.wallet.findUnique({
        where: {
          userId,
        },
      });

    if (wallet) {
      const walletTransactions =
        await db.walletTransaction.findMany({
          where: {
            walletId:
              wallet.id,
          },

          select: {
            id: true,
          },
        });

      for (
        const tx of
        walletTransactions
      ) {
        await db.journal.deleteMany({
          where: {
            referenceType:
              "WalletTransaction",

            referenceId:
              tx.id,
          },
        });
      }
    }

    const rewardPoints =
      await db.rewardPoints.findUnique({
        where: {
          userId,
        },
      });

    if (rewardPoints) {
      const histories =
        await db.rewardHistory.findMany({
          where: {
            rewardId:
              rewardPoints.id,
          },

          select: {
            id: true,
          },
        });

      for (
        const history of
        histories
      ) {
        await db.journal.deleteMany({
          where: {
            referenceType:
              "RewardHistory",

            referenceId:
              history.id,
          },
        });
      }
    }

    await db.user.deleteMany({
      where: {
        id: userId,
      },
    });
  }

  userIds.clear();
});

afterAll(async () => {
  if (db) {
    await db.$disconnect();
  }
});

async function createUser() {
  const key =
    `store-gift-it-${Date.now()}-${++sequence}`;

  const user =
    await db.user.create({
      data: {
        name:
          key,

        email:
          `${key}@test.local`,
      },
    });

  userIds.add(
    user.id,
  );

  return user;
}

async function state(
  userId: string,
) {
  const [
    wallet,
    rewardPoints,
    claims,
  ] =
    await Promise.all([
      db.wallet.findUnique({
        where: {
          userId,
        },
      }),

      db.rewardPoints.findUnique({
        where: {
          userId,
        },
      }),

      db.storeGiftCampaignClaim.findMany({
        where: {
          userId,
        },

        orderBy: {
          createdAt:
            "asc",
        },
      }),
    ]);

  const walletTransactions =
    wallet
      ? await db.walletTransaction.findMany({
          where: {
            walletId:
              wallet.id,
          },

          orderBy: {
            createdAt:
              "asc",
          },
        })
      : [];

  const rewardHistory =
    rewardPoints
      ? await db.rewardHistory.findMany({
          where: {
            rewardId:
              rewardPoints.id,
          },

          orderBy: {
            createdAt:
              "asc",
          },
        })
      : [];

  const walletTransactionIds =
    walletTransactions.map(
      (x) => x.id,
    );

  const rewardHistoryIds =
    rewardHistory.map(
      (x) => x.id,
    );

  const journalOr: Array<{
    referenceType: string;
    referenceId: {
      in: string[];
    };
  }> = [];

  if (
    walletTransactionIds.length >
    0
  ) {
    journalOr.push({
      referenceType:
        "WalletTransaction",

      referenceId: {
        in:
          walletTransactionIds,
      },
    });
  }

  if (
    rewardHistoryIds.length >
    0
  ) {
    journalOr.push({
      referenceType:
        "RewardHistory",

      referenceId: {
        in:
          rewardHistoryIds,
      },
    });
  }

  const journals =
    journalOr.length > 0
      ? await db.journal.findMany({
          where: {
            OR:
              journalOr,
          },

          include: {
            entries: {
              include: {
                account:
                  true,
              },
            },
          },

          orderBy: {
            createdAt:
              "asc",
          },
        })
      : [];

  return {
    wallet,
    rewardPoints,
    claims,
    walletTransactions,
    rewardHistory,
    journals,
  };
}

function findEntry(
  journal:
    Awaited<
      ReturnType<
        typeof state
      >
    >["journals"][number],
  accountCode: string,
) {
  return journal.entries.find(
    (entry) =>
      entry.account.code ===
      accountCode,
  );
}

describe(
  "store gift — real fitzone_test atomic integration",
  () => {
    it(
      "grants wallet gift with ledger and GL journal",
      async () => {
        const user =
          await createUser();

        const result =
          await grantStoreGiftClaimAtomic({
            userId:
              user.id,

            storeOrderId:
              null,

            source:
              "integration_test",

            maxClaimsPerUser:
              1,

            rewardType:
              "wallet",

            rewardWalletAmount:
              50,
          });

        expect(
          result.status,
        ).toBe(
          "claimed",
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.claims,
        ).toHaveLength(
          1,
        );

        expect(
          stored.claims[0]
            .status,
        ).toBe(
          "claimed",
        );

        expect(
          stored.wallet
            ?.balance,
        ).toBe(
          50,
        );

        expect(
          stored.walletTransactions,
        ).toHaveLength(
          1,
        );

        expect(
          stored.walletTransactions[0],
        ).toMatchObject({
          amount: 50,
          type:
            "credit",
        });

        expect(
          stored.journals,
        ).toHaveLength(
          1,
        );

        const journal =
          stored.journals[0];

        expect(
          journal.referenceType,
        ).toBe(
          "WalletTransaction",
        );

        expect(
          journal.referenceId,
        ).toBe(
          stored.walletTransactions[0]
            .id,
        );

        const expense =
          findEntry(
            journal,
            "5020",
          );

        const liability =
          findEntry(
            journal,
            "2020",
          );

        expect(
          expense,
        ).toBeTruthy();

        expect(
          liability,
        ).toBeTruthy();

        expect(
          Number(
            expense!.debit,
          ),
        ).toBe(
          50,
        );

        expect(
          Number(
            expense!.credit,
          ),
        ).toBe(
          0,
        );

        expect(
          Number(
            liability!.debit,
          ),
        ).toBe(
          0,
        );

        expect(
          Number(
            liability!.credit,
          ),
        ).toBe(
          50,
        );
      },
    );

    it(
      "serializes concurrent claims so limit and GL cannot duplicate",
      async () => {
        const user =
          await createUser();

        const input = {
          userId:
            user.id,

          storeOrderId:
            null,

          source:
            "integration_concurrency",

          maxClaimsPerUser:
            1,

          rewardType:
            "wallet" as const,

          rewardWalletAmount:
            40,
        };

        const results =
          await Promise.all([
            grantStoreGiftClaimAtomic(
              input,
            ),

            grantStoreGiftClaimAtomic(
              input,
            ),
          ]);

        expect(
          results.filter(
            (r) =>
              r.status ===
              "claimed",
          ),
        ).toHaveLength(
          1,
        );

        expect(
          results.filter(
            (r) =>
              r.status ===
              "limit_reached",
          ),
        ).toHaveLength(
          1,
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.claims,
        ).toHaveLength(
          1,
        );

        expect(
          stored.wallet
            ?.balance,
        ).toBe(
          40,
        );

        expect(
          stored.walletTransactions,
        ).toHaveLength(
          1,
        );

        expect(
          stored.journals,
        ).toHaveLength(
          1,
        );

        const journal =
          stored.journals[0];

        expect(
          Number(
            findEntry(
              journal,
              "5020",
            )!.debit,
          ),
        ).toBe(
          40,
        );

        expect(
          Number(
            findEntry(
              journal,
              "2020",
            )!.credit,
          ),
        ).toBe(
          40,
        );
      },
    );

    it(
      "rolls back wallet balance before ledger and GL when delivery fails",
      async () => {
        const user =
          await createUser();

        setStoreGiftRewardTestFailpoint(
          "after_wallet_balance",
        );

        await expect(
          grantStoreGiftClaimAtomic({
            userId:
              user.id,

            storeOrderId:
              null,

            source:
              "integration_rollback",

            maxClaimsPerUser:
              1,

            rewardType:
              "wallet",

            rewardWalletAmount:
              75,
          }),
        ).rejects.toThrow(
          "STORE_GIFT_REWARD_TEST_FAILPOINT:after_wallet_balance",
        );

        setStoreGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.claims,
        ).toHaveLength(
          0,
        );

        expect(
          stored.wallet,
        ).toBeNull();

        expect(
          stored.walletTransactions,
        ).toHaveLength(
          0,
        );

        expect(
          stored.journals,
        ).toHaveLength(
          0,
        );
      },
    );

    it(
      "rolls back wallet reward and GL journal when post-GL processing fails",
      async () => {
        const user =
          await createUser();

        setStoreGiftRewardTestFailpoint(
          "after_gl",
        );

        await expect(
          grantStoreGiftClaimAtomic({
            userId:
              user.id,

            storeOrderId:
              null,

            source:
              "integration_gl_rollback",

            maxClaimsPerUser:
              1,

            rewardType:
              "wallet",

            rewardWalletAmount:
              65,
          }),
        ).rejects.toThrow(
          "STORE_GIFT_REWARD_TEST_FAILPOINT:after_gl",
        );

        setStoreGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.claims,
        ).toHaveLength(
          0,
        );

        expect(
          stored.wallet,
        ).toBeNull();

        expect(
          stored.walletTransactions,
        ).toHaveLength(
          0,
        );

        expect(
          stored.journals,
        ).toHaveLength(
          0,
        );
      },
    );

    it(
      "grants points with RewardHistory and GL liability journal atomically",
      async () => {
        const user =
          await createUser();

        const result =
          await grantStoreGiftClaimAtomic({
            userId:
              user.id,

            storeOrderId:
              null,

            source:
              "integration_points",

            maxClaimsPerUser:
              1,

            rewardType:
              "points",

            rewardPoints:
              120,
          });

        expect(
          result.status,
        ).toBe(
          "claimed",
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.rewardPoints
            ?.points,
        ).toBe(
          120,
        );

        expect(
          stored.rewardHistory,
        ).toHaveLength(
          1,
        );

        expect(
          stored.rewardHistory[0],
        ).toMatchObject({
          points:
            120,

          reason:
            "store_gift_campaign",
        });

        expect(
          stored.claims,
        ).toHaveLength(
          1,
        );

        expect(
          stored.claims[0]
            .status,
        ).toBe(
          "claimed",
        );

        expect(
          stored.journals,
        ).toHaveLength(
          1,
        );

        const journal =
          stored.journals[0];

        expect(
          journal.referenceType,
        ).toBe(
          "RewardHistory",
        );

        expect(
          journal.referenceId,
        ).toBe(
          stored.rewardHistory[0]
            .id,
        );

        const expense =
          findEntry(
            journal,
            "5020",
          );

        const liability =
          findEntry(
            journal,
            "2030",
          );

        expect(
          expense,
        ).toBeTruthy();

        expect(
          liability,
        ).toBeTruthy();

        const {
          getRewardSettings,
        } = await import(
          "@/lib/reward-settings"
        );

        const rewardSettings =
          await getRewardSettings();

        const expectedLiability =
          Math.round(
            120 *
              Number(
                rewardSettings.pointValueEGP ??
                  0,
              ) *
              100,
          ) / 100;

        expect(
          Number(
            expense!.debit,
          ),
        ).toBe(
          expectedLiability,
        );

        expect(
          Number(
            liability!.credit,
          ),
        ).toBe(
          expectedLiability,
        );
      },
    );

    it(
      "rolls back points balance before history and GL when delivery fails",
      async () => {
        const user =
          await createUser();

        setStoreGiftRewardTestFailpoint(
          "after_points_balance",
        );

        await expect(
          grantStoreGiftClaimAtomic({
            userId:
              user.id,

            storeOrderId:
              null,

            source:
              "integration_points_rollback",

            maxClaimsPerUser:
              1,

            rewardType:
              "points",

            rewardPoints:
              100,
          }),
        ).rejects.toThrow(
          "STORE_GIFT_REWARD_TEST_FAILPOINT:after_points_balance",
        );

        setStoreGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.claims,
        ).toHaveLength(
          0,
        );

        expect(
          stored.rewardPoints,
        ).toBeNull();

        expect(
          stored.rewardHistory,
        ).toHaveLength(
          0,
        );

        expect(
          stored.journals,
        ).toHaveLength(
          0,
        );
      },
    );

    it(
      "rolls back points reward, RewardHistory and GL when post-GL processing fails",
      async () => {
        const user =
          await createUser();

        setStoreGiftRewardTestFailpoint(
          "after_gl",
        );

        await expect(
          grantStoreGiftClaimAtomic({
            userId:
              user.id,

            storeOrderId:
              null,

            source:
              "integration_points_gl_rollback",

            maxClaimsPerUser:
              1,

            rewardType:
              "points",

            rewardPoints:
              100,
          }),
        ).rejects.toThrow(
          "STORE_GIFT_REWARD_TEST_FAILPOINT:after_gl",
        );

        setStoreGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.claims,
        ).toHaveLength(
          0,
        );

        expect(
          stored.rewardPoints,
        ).toBeNull();

        expect(
          stored.rewardHistory,
        ).toHaveLength(
          0,
        );

        expect(
          stored.journals,
        ).toHaveLength(
          0,
        );
      },
    );

    it(
      "keeps non-instant rewards earned without wallet, points or GL entries",
      async () => {
        const user =
          await createUser();

        const result =
          await grantStoreGiftClaimAtomic({
            userId:
              user.id,

            storeOrderId:
              null,

            source:
              "integration_discount",

            maxClaimsPerUser:
              1,

            rewardType:
              "discount",

            discountAmount:
              25,
          });

        expect(
          result.status,
        ).toBe(
          "earned",
        );

        const stored =
          await state(
            user.id,
          );

        expect(
          stored.claims,
        ).toHaveLength(
          1,
        );

        expect(
          stored.claims[0]
            .status,
        ).toBe(
          "earned",
        );

        expect(
          stored.claims[0]
            .rewardValue,
        ).toBe(
          25,
        );

        expect(
          stored.wallet,
        ).toBeNull();

        expect(
          stored.rewardPoints,
        ).toBeNull();

        expect(
          stored.walletTransactions,
        ).toHaveLength(
          0,
        );

        expect(
          stored.rewardHistory,
        ).toHaveLength(
          0,
        );

        expect(
          stored.journals,
        ).toHaveLength(
          0,
        );
      },
    );
  },
);
