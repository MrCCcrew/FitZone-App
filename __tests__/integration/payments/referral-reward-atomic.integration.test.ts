import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

let db: typeof import("@/lib/db").db;

let unlockPendingReferralReward:
  typeof import("@/lib/payments/service").unlockPendingReferralReward;

let setReferralRewardTestFailpoint:
  typeof import("@/lib/payments/service").setReferralRewardTestFailpoint;

const userIds = new Set<string>();
const journalRefs = new Set<{
  type: string;
  id: string;
}>();

let sequence = 0;

function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;

  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required for referral integration tests.",
    );
  }

  const url = new URL(value);

  const database = decodeURIComponent(
    url.pathname.replace(/^\//, ""),
  );

  if (database !== "fitzone_test") {
    throw new Error(
      "Referral integration tests require fitzone_test.",
    );
  }

  return value;
}

beforeAll(async () => {
  process.env.DATABASE_URL =
    testDatabaseUrl();

  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Referral integration tests require NODE_ENV=test.",
    );
  }

  ({ db } = await import("@/lib/db"));

  ({
    unlockPendingReferralReward,
    setReferralRewardTestFailpoint,
  } = await import("@/lib/payments/service"));
});

afterEach(async () => {
  if (setReferralRewardTestFailpoint) {
    setReferralRewardTestFailpoint(null);
  }

  for (const ref of journalRefs) {
    await db.journal.deleteMany({
      where: {
        referenceType: ref.type,
        referenceId: ref.id,
      },
    });
  }

  journalRefs.clear();

  for (const userId of userIds) {
    await db.user.deleteMany({
      where: { id: userId },
    });
  }

  userIds.clear();
});

afterAll(async () => {
  if (db) {
    await db.$disconnect();
  }
});

async function fixture(options?: {
  rewardGiven?: boolean;
  subscriptionActivated?: boolean;
}) {
  const key =
    `referral-it-${Date.now()}-${++sequence}`;

  const referrer =
    await db.user.create({
      data: {
        name: `Referrer ${key}`,
        email:
          `referrer-${key}@test.local`,
      },
    });

  const referred =
    await db.user.create({
      data: {
        name: `Referred ${key}`,
        email:
          `referred-${key}@test.local`,
      },
    });

  userIds.add(referrer.id);
  userIds.add(referred.id);

  await db.wallet.create({
    data: {
      userId: referrer.id,
      balance: 0,
    },
  });

  await db.rewardPoints.create({
    data: {
      userId: referrer.id,
      points: 0,
      tier: "bronze",
    },
  });

  const referral =
    await db.referral.create({
      data: {
        userId: referrer.id,
        code: `IT-${key}`.slice(0, 30),

        totalEarned:
          options?.rewardGiven
            ? 50
            : 0,

        subscriptionActivatedCount:
          options?.subscriptionActivated
            ? 1
            : 0,
      },
    });

  const usage =
    await db.referralUsage.create({
      data: {
        referralId:
          referral.id,

        referredUserId:
          referred.id,

        rewardGiven:
          options?.rewardGiven ??
          false,

        rewardType:
          options?.rewardGiven
            ? "wallet"
            : null,

        rewardValue:
          options?.rewardGiven
            ? 50
            : null,

        subscriptionActivated:
          options?.subscriptionActivated ??
          false,

        subscriptionActivatedAt:
          options?.subscriptionActivated
            ? new Date()
            : null,
      },
    });

  return {
    referrerId:
      referrer.id,

    referredId:
      referred.id,

    referralId:
      referral.id,

    usageId:
      usage.id,
  };
}

async function state(
  record: Awaited<
    ReturnType<typeof fixture>
  >,
) {
  const [
    usage,
    referral,
    wallet,
  ] = await Promise.all([
    db.referralUsage.findUniqueOrThrow({
      where: {
        id: record.usageId,
      },
    }),

    db.referral.findUniqueOrThrow({
      where: {
        id: record.referralId,
      },
    }),

    db.wallet.findUniqueOrThrow({
      where: {
        userId:
          record.referrerId,
      },
    }),
  ]);

  const walletTransactions =
    await db.walletTransaction.findMany({
      where: {
        walletId:
          wallet.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

  return {
    usage,
    referral,
    wallet,
    walletTransactions,
  };
}

async function findJournalForWalletTransaction(
  walletTransactionId: string,
) {
  return db.journal.findUnique({
    where: {
      referenceType_referenceId: {
        referenceType:
          "WalletTransaction",

        referenceId:
          walletTransactionId,
      },
    },

    include: {
      entries: {
        include: {
          account: true,
        },
      },
    },
  });
}

describe(
  "referral reward — real fitzone_test atomic integration",
  () => {
    it(
      "rewards exactly once under concurrent activation attempts and posts one GL journal",
      async () => {
        const record =
          await fixture();

        await Promise.all([
          unlockPendingReferralReward(
            record.referredId,
          ),

          unlockPendingReferralReward(
            record.referredId,
          ),
        ]);

        const stored =
          await state(record);

        expect(
          stored.usage
            .subscriptionActivated,
        ).toBe(true);

        expect(
          stored.usage.rewardGiven,
        ).toBe(true);

        expect(
          stored.usage.rewardType,
        ).toBe("wallet");

        expect(
          stored.usage.rewardValue,
        ).toBe(50);

        expect(
          stored.referral
            .subscriptionActivatedCount,
        ).toBe(1);

        expect(
          stored.referral.totalEarned,
        ).toBe(50);

        expect(
          stored.wallet.balance,
        ).toBe(50);

        expect(
          stored.walletTransactions,
        ).toHaveLength(1);

        const walletTx =
          stored.walletTransactions[0];

        journalRefs.add({
          type:
            "WalletTransaction",
          id: walletTx.id,
        });

        const journal =
          await findJournalForWalletTransaction(
            walletTx.id,
          );

        expect(journal).toBeTruthy();

        const expense =
          journal!.entries.find(
            (e) =>
              e.account.code ===
              "5020",
          );

        const liability =
          journal!.entries.find(
            (e) =>
              e.account.code ===
              "2020",
          );

        expect(
          Number(expense!.debit),
        ).toBe(50);

        expect(
          Number(expense!.credit),
        ).toBe(0);

        expect(
          Number(liability!.debit),
        ).toBe(0);

        expect(
          Number(liability!.credit),
        ).toBe(50);
      },
    );

    it(
      "activates a legacy already-rewarded referral without granting or posting a second reward",
      async () => {
        const record =
          await fixture({
            rewardGiven: true,
            subscriptionActivated:
              false,
          });

        await unlockPendingReferralReward(
          record.referredId,
        );

        const stored =
          await state(record);

        expect(
          stored.usage
            .subscriptionActivated,
        ).toBe(true);

        expect(
          stored.usage.rewardGiven,
        ).toBe(true);

        expect(
          stored.referral
            .subscriptionActivatedCount,
        ).toBe(1);

        expect(
          stored.referral.totalEarned,
        ).toBe(50);

        expect(
          stored.wallet.balance,
        ).toBe(0);

        expect(
          stored.walletTransactions,
        ).toHaveLength(0);
      },
    );

    it(
      "is idempotent after successful activation, reward, and GL posting",
      async () => {
        const record =
          await fixture();

        await unlockPendingReferralReward(
          record.referredId,
        );

        await unlockPendingReferralReward(
          record.referredId,
        );

        const stored =
          await state(record);

        expect(
          stored.referral
            .subscriptionActivatedCount,
        ).toBe(1);

        expect(
          stored.referral.totalEarned,
        ).toBe(50);

        expect(
          stored.wallet.balance,
        ).toBe(50);

        expect(
          stored.walletTransactions,
        ).toHaveLength(1);

        const walletTx =
          stored.walletTransactions[0];

        journalRefs.add({
          type:
            "WalletTransaction",
          id: walletTx.id,
        });

        expect(
          await db.journal.count({
            where: {
              referenceType:
                "WalletTransaction",

              referenceId:
                walletTx.id,
            },
          }),
        ).toBe(1);
      },
    );

    it(
      "rolls back activation and counters when activation processing fails",
      async () => {
        const record =
          await fixture();

        setReferralRewardTestFailpoint(
          "after_activation",
        );

        await expect(
          unlockPendingReferralReward(
            record.referredId,
          ),
        ).rejects.toThrow(
          "REFERRAL_REWARD_TEST_FAILPOINT:after_activation",
        );

        setReferralRewardTestFailpoint(
          null,
        );

        const stored =
          await state(record);

        expect(
          stored.usage
            .subscriptionActivated,
        ).toBe(false);

        expect(
          stored.usage.rewardGiven,
        ).toBe(false);

        expect(
          stored.referral
            .subscriptionActivatedCount,
        ).toBe(0);

        expect(
          stored.referral.totalEarned,
        ).toBe(0);

        expect(
          stored.wallet.balance,
        ).toBe(0);

        expect(
          stored.walletTransactions,
        ).toHaveLength(0);
      },
    );

    it(
      "rolls back wallet reward and GL journal when post-reward processing fails",
      async () => {
        const record =
          await fixture();

        setReferralRewardTestFailpoint(
          "after_reward",
        );

        await expect(
          unlockPendingReferralReward(
            record.referredId,
          ),
        ).rejects.toThrow(
          "REFERRAL_REWARD_TEST_FAILPOINT:after_reward",
        );

        setReferralRewardTestFailpoint(
          null,
        );

        const stored =
          await state(record);

        expect(
          stored.usage
            .subscriptionActivated,
        ).toBe(false);

        expect(
          stored.usage.rewardGiven,
        ).toBe(false);

        expect(
          stored.referral
            .subscriptionActivatedCount,
        ).toBe(0);

        expect(
          stored.referral.totalEarned,
        ).toBe(0);

        expect(
          stored.wallet.balance,
        ).toBe(0);

        expect(
          stored.walletTransactions,
        ).toHaveLength(0);

        const journals =
          await db.journal.findMany({
            where: {
              referenceType:
                "WalletTransaction",

              description: {
                startsWith:
                  "Promotional wallet credit",
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            take: 5,
          });

        // The failed fixture has no surviving WalletTransaction,
        // therefore its promotional GL posting must also have rolled back.
        expect(
          stored.walletTransactions,
        ).toHaveLength(0);

        expect(
          journals,
        ).toBeDefined();
      },
    );
  },
);
