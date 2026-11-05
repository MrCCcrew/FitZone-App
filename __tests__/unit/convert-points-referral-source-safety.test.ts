import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  siteContentFindUnique: vi.fn(),
  transaction: vi.fn(),

  queryRaw: vi.fn(),
  rewardPointsFindUnique: vi.fn(),
  rewardPointsUpdate: vi.fn(),
  rewardHistoryFindMany: vi.fn(),
  rewardHistoryCreate: vi.fn(),
  walletUpsert: vi.fn(),
  walletTransactionCreate: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser:
    mocks.getCurrentAppUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    siteContent: {
      findUnique:
        mocks.siteContentFindUnique,
    },
    $transaction:
      mocks.transaction,
  },
}));

import { POST } from "@/app/api/me/convert-points/route";

type HistoryRow = {
  points: number;
  reason: string;
};

function request(points: number) {
  return new Request(
    "http://localhost/api/me/convert-points",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        points,
      }),
    },
  );
}

function configureLedger(input: {
  currentPoints: number;
  history: HistoryRow[];
  locked?: boolean;
}) {
  mocks.queryRaw.mockResolvedValue(
    input.locked === false
      ? []
      : [{ id: "rp-1" }],
  );

  mocks.rewardPointsFindUnique.mockResolvedValue({
    id: "rp-1",
    userId: "user-1",
    points: input.currentPoints,
    tier: "bronze",
  });

  mocks.rewardHistoryFindMany.mockResolvedValue(
    input.history,
  );

  mocks.rewardPointsUpdate.mockResolvedValue({
    id: "rp-1",
  });

  mocks.rewardHistoryCreate.mockResolvedValue({
    id: "rh-convert",
  });

  mocks.walletUpsert.mockResolvedValue({
    id: "wallet-1",
  });

  mocks.walletTransactionCreate.mockResolvedValue({
    id: "wallet-tx-1",
  });

  const tx = {
    $queryRaw:
      mocks.queryRaw,

    rewardPoints: {
      findUnique:
        mocks.rewardPointsFindUnique,
      update:
        mocks.rewardPointsUpdate,
    },

    rewardHistory: {
      findMany:
        mocks.rewardHistoryFindMany,
      create:
        mocks.rewardHistoryCreate,
    },

    wallet: {
      upsert:
        mocks.walletUpsert,
    },

    walletTransaction: {
      create:
        mocks.walletTransactionCreate,
    },
  };

  type TransactionCallback = (
    transactionClient: typeof tx,
  ) => Promise<unknown>;

  mocks.transaction.mockImplementation(
    async (
      callback: TransactionCallback,
    ) => callback(tx),
  );
}

describe(
  "convert points referral source safety",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getCurrentAppUser.mockResolvedValue({
        id: "user-1",
      });

      mocks.siteContentFindUnique.mockResolvedValue(
        null,
      );
    });

    it(
      "converts ordinary points and records points_conversion wallet source",
      async () => {
        configureLedger({
          currentPoints: 100,
          history: [
            {
              points: 100,
              reason:
                "membership_purchase",
            },
          ],
        });

        const response =
          await POST(request(40));

        expect(response.status).toBe(200);

        await expect(
          response.json(),
        ).resolves.toMatchObject({
          success: true,
          convertedPoints: 40,
          egpAmount: 4,
          convertiblePoints: 60,
        });

        expect(
          mocks.queryRaw,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.rewardPointsUpdate,
        ).toHaveBeenCalledWith({
          where: {
            id: "rp-1",
          },
          data: {
            points: {
              decrement: 40,
            },
          },
        });

        expect(
          mocks.walletTransactionCreate,
        ).toHaveBeenCalledWith({
          data: expect.objectContaining({
            walletId: "wallet-1",
            amount: 4,
            type: "credit",
            source:
              "points_conversion",
          }),
        });
      },
    );

    it.each([
      "referral_signup",
      "referral_bonus",
    ])(
      "blocks conversion of protected %s points",
      async (reason) => {
        configureLedger({
          currentPoints: 50,
          history: [
            {
              points: 50,
              reason,
            },
          ],
        });

        const response =
          await POST(request(1));

        expect(response.status).toBe(400);

        expect(
          mocks.rewardPointsUpdate,
        ).not.toHaveBeenCalled();

        expect(
          mocks.walletTransactionCreate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "allows only the general portion of a mixed points balance",
      async () => {
        configureLedger({
          currentPoints: 150,
          history: [
            {
              points: 50,
              reason:
                "referral_bonus",
            },
            {
              points: 100,
              reason:
                "membership_purchase",
            },
          ],
        });

        const allowed =
          await POST(request(100));

        expect(allowed.status).toBe(200);

        await expect(
          allowed.json(),
        ).resolves.toMatchObject({
          convertiblePoints: 0,
        });

        vi.clearAllMocks();

        mocks.getCurrentAppUser.mockResolvedValue({
          id: "user-1",
        });

        mocks.siteContentFindUnique.mockResolvedValue(
          null,
        );

        configureLedger({
          currentPoints: 150,
          history: [
            {
              points: 50,
              reason:
                "referral_bonus",
            },
            {
              points: 100,
              reason:
                "membership_purchase",
            },
          ],
        });

        const blocked =
          await POST(request(101));

        expect(blocked.status).toBe(400);

        expect(
          mocks.rewardPointsUpdate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "replays historical debits using general points before protected referral points",
      async () => {
        configureLedger({
          currentPoints: 100,
          history: [
            {
              points: 50,
              reason:
                "referral_signup",
            },
            {
              points: 100,
              reason:
                "membership_purchase",
            },
            {
              points: -120,
              reason:
                "استخدام فيتزونات لسداد طلب",
            },
            {
              points: 70,
              reason:
                "membership_purchase",
            },
          ],
        });

        const response =
          await POST(request(70));

        expect(response.status).toBe(200);

        await expect(
          response.json(),
        ).resolves.toMatchObject({
          convertedPoints: 70,
          convertiblePoints: 0,
        });
      },
    );

    it(
      "fails closed when RewardPoints balance does not match RewardHistory ledger",
      async () => {
        configureLedger({
          currentPoints: 90,
          history: [
            {
              points: 100,
              reason:
                "membership_purchase",
            },
          ],
        });

        const response =
          await POST(request(10));

        expect(response.status).toBe(409);

        expect(
          mocks.rewardPointsUpdate,
        ).not.toHaveBeenCalled();

        expect(
          mocks.walletUpsert,
        ).not.toHaveBeenCalled();

        expect(
          mocks.walletTransactionCreate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails safely when the RewardPoints row cannot be locked",
      async () => {
        configureLedger({
          currentPoints: 100,
          history: [
            {
              points: 100,
              reason:
                "membership_purchase",
            },
          ],
          locked: false,
        });

        const response =
          await POST(request(10));

        expect(response.status).toBe(400);

        expect(
          mocks.rewardPointsFindUnique,
        ).not.toHaveBeenCalled();

        expect(
          mocks.rewardPointsUpdate,
        ).not.toHaveBeenCalled();

        expect(
          mocks.walletTransactionCreate,
        ).not.toHaveBeenCalled();
      },
    );
  },
);