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

let confirmFreeGiftSessionAtomic:
  typeof import("@/lib/free-gift-reward-service").confirmFreeGiftSessionAtomic;

let setFreeGiftRewardTestFailpoint:
  typeof import("@/lib/free-gift-reward-service").setFreeGiftRewardTestFailpoint;

const userIds =
  new Set<string>();

let sequence = 0;

function testDatabaseUrl() {
  const value =
    process.env.TEST_DATABASE_URL;

  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required for free gift integration tests.",
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
      "Free gift integration tests require fitzone_test.",
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
      "Free gift integration tests require NODE_ENV=test.",
    );
  }

  ({
    db,
  } = await import(
    "@/lib/db"
  ));

  ({
    confirmFreeGiftSessionAtomic,
    setFreeGiftRewardTestFailpoint,
  } = await import(
    "@/lib/free-gift-reward-service"
  ));
});

afterEach(async () => {
  if (
    setFreeGiftRewardTestFailpoint
  ) {
    setFreeGiftRewardTestFailpoint(
      null,
    );
  }

  for (
    const userId of userIds
  ) {
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
        const walletTx of
        walletTransactions
      ) {
        await db.journal.deleteMany({
          where: {
            referenceType:
              "WalletTransaction",

            referenceId:
              walletTx.id,
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
        id:
          userId,
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

async function createFixture(
  rewardType:
    | "wallet"
    | "points"
    | "free_product",
  rewardValue: number,
) {
  const key =
    `free-gift-it-${Date.now()}-${++sequence}`;

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

  const session =
    await db.storeFreeGiftsSession.create({
      data: {
        token:
          `token-${key}`,

        userId:
          user.id,

        step:
          3,

        spinsDone:
          1,

        spinRewardType:
          rewardType,

        spinRewardValue:
          rewardValue,

        cardsDone:
          1,

        cardsData:
          JSON.stringify(
            [],
          ),

        selectedProductIds:
          JSON.stringify([
            "integration-product-id",
          ]),

        giftSlotsCount:
          1,

        status:
          "active",
      },
    });

  return {
    userId:
      user.id,

    sessionId:
      session.id,

    token:
      session.token,
  };
}

async function state(
  record: Awaited<
    ReturnType<
      typeof createFixture
    >
  >,
) {
  const [
    session,
    wallet,
    rewards,
  ] =
    await Promise.all([
      db.storeFreeGiftsSession.findUniqueOrThrow({
        where: {
          id:
            record.sessionId,
        },
      }),

      db.wallet.findUnique({
        where: {
          userId:
            record.userId,
        },
      }),

      db.rewardPoints.findUnique({
        where: {
          userId:
            record.userId,
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
    rewards
      ? await db.rewardHistory.findMany({
          where: {
            rewardId:
              rewards.id,
          },

          orderBy: {
            createdAt:
              "asc",
          },
        })
      : [];

  const walletTransactionIds =
    walletTransactions.map(
      (item) =>
        item.id,
    );

  const rewardHistoryIds =
    rewardHistory.map(
      (item) =>
        item.id,
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
    session,
    wallet,
    rewards,
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
  "free gifts — real fitzone_test atomic integration",
  () => {
    it(
      "credits wallet, posts GL and confirms session atomically",
      async () => {
        const record =
          await createFixture(
            "wallet",
            50,
          );

        const result =
          await confirmFreeGiftSessionAtomic(
            record.token,
          );

        expect(
          result.rewardType,
        ).toBe(
          "wallet",
        );

        expect(
          result.rewardValue,
        ).toBe(
          50,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "confirmed",
        );

        expect(
          stored.session.confirmedAt,
        ).not.toBeNull();

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
          Number(
            expense!.debit,
          ),
        ).toBe(
          50,
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
      "credits reward points, posts GL and confirms session atomically",
      async () => {
        const record =
          await createFixture(
            "points",
            120,
          );

        await confirmFreeGiftSessionAtomic(
          record.token,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "confirmed",
        );

        expect(
          stored.rewards
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
            "free_gifts_game",
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
      "rolls back wallet reward before GL if reward processing fails",
      async () => {
        const record =
          await createFixture(
            "wallet",
            75,
          );

        setFreeGiftRewardTestFailpoint(
          "after_reward",
        );

        await expect(
          confirmFreeGiftSessionAtomic(
            record.token,
          ),
        ).rejects.toThrow(
          "FREE_GIFT_REWARD_TEST_FAILPOINT:after_reward",
        );

        setFreeGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "active",
        );

        expect(
          stored.session.confirmedAt,
        ).toBeNull();

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
      "rolls back points reward before GL if reward processing fails",
      async () => {
        const record =
          await createFixture(
            "points",
            100,
          );

        setFreeGiftRewardTestFailpoint(
          "after_reward",
        );

        await expect(
          confirmFreeGiftSessionAtomic(
            record.token,
          ),
        ).rejects.toThrow(
          "FREE_GIFT_REWARD_TEST_FAILPOINT:after_reward",
        );

        setFreeGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "active",
        );

        expect(
          stored.rewards,
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
      "rolls back wallet reward and GL journal when post-GL processing fails",
      async () => {
        const record =
          await createFixture(
            "wallet",
            60,
          );

        setFreeGiftRewardTestFailpoint(
          "after_gl",
        );

        await expect(
          confirmFreeGiftSessionAtomic(
            record.token,
          ),
        ).rejects.toThrow(
          "FREE_GIFT_REWARD_TEST_FAILPOINT:after_gl",
        );

        setFreeGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "active",
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
      "rolls back points reward and GL journal when post-GL processing fails",
      async () => {
        const record =
          await createFixture(
            "points",
            100,
          );

        setFreeGiftRewardTestFailpoint(
          "after_gl",
        );

        await expect(
          confirmFreeGiftSessionAtomic(
            record.token,
          ),
        ).rejects.toThrow(
          "FREE_GIFT_REWARD_TEST_FAILPOINT:after_gl",
        );

        setFreeGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "active",
        );

        expect(
          stored.rewards,
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
      "rolls back reward and GL if confirmation fails",
      async () => {
        const record =
          await createFixture(
            "wallet",
            30,
          );

        setFreeGiftRewardTestFailpoint(
          "before_confirm",
        );

        await expect(
          confirmFreeGiftSessionAtomic(
            record.token,
          ),
        ).rejects.toThrow(
          "FREE_GIFT_REWARD_TEST_FAILPOINT:before_confirm",
        );

        setFreeGiftRewardTestFailpoint(
          null,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "active",
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
      "prevents confirmed session from granting reward or GL twice",
      async () => {
        const record =
          await createFixture(
            "wallet",
            40,
          );

        await confirmFreeGiftSessionAtomic(
          record.token,
        );

        await expect(
          confirmFreeGiftSessionAtomic(
            record.token,
          ),
        ).rejects.toThrow(
          "FREE_GIFT_SESSION_NOT_ACTIVE",
        );

        const stored =
          await state(
            record,
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
      },
    );

    it(
      "confirms non-monetary reward without wallet, points or GL",
      async () => {
        const record =
          await createFixture(
            "free_product",
            0,
          );

        await confirmFreeGiftSessionAtomic(
          record.token,
        );

        const stored =
          await state(
            record,
          );

        expect(
          stored.session.status,
        ).toBe(
          "confirmed",
        );

        expect(
          stored.wallet,
        ).toBeNull();

        expect(
          stored.rewards,
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
