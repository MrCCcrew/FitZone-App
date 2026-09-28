import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  orderFindUnique: vi.fn(),
  updatePaymentStatus: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findMany: mocks.orderFindMany,
      findUnique: mocks.orderFindUnique,
    },
  },
}));

vi.mock("@/lib/payments/service", () => ({
  updatePaymentTransactionStatus:
    mocks.updatePaymentStatus,
}));

import { GET } from "@/app/api/cron/cancel-pending-orders/route";

const NOW =
  new Date("2026-09-28T16:00:00.000Z");

function makePayment(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "payment-1",
    purpose: "order",
    businessUnit: "store",
    status: "pending",
    expiresAt:
      new Date("2026-09-28T15:30:00.000Z"),
    createdAt:
      new Date("2026-09-28T15:00:00.000Z"),
    updatedAt:
      new Date("2026-09-28T15:00:00.000Z"),
    ...overrides,
  };
}

function makeOrder(
  payment = makePayment(),
) {
  return {
    id: "order-1",
    paymentTransactions: [payment],
  };
}

function makeRequest() {
  return new Request(
    "http://localhost/api/cron/cancel-pending-orders",
    {
      headers: {
        "x-cron-secret": "cron-test-secret",
      },
    },
  );
}

describe(
  "Store pending-order timeout cron",
  () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);

      process.env.APP_ENV = "test";
      process.env.CRON_SECRET =
        "cron-test-secret";

      mocks.orderFindMany.mockReset();
      mocks.orderFindUnique.mockReset();
      mocks.updatePaymentStatus.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
      delete process.env.CRON_SECRET;
      delete process.env.APP_ENV;
    });

    it(
      "expires the current Store payment through the canonical payment failure path",
      async () => {
        mocks.orderFindMany.mockResolvedValue([
          makeOrder(),
        ]);

        mocks.updatePaymentStatus.mockResolvedValue(
          {
            status: "expired",
          },
        );

        mocks.orderFindUnique.mockResolvedValue({
          status: "cancelled",
        });

        const response =
          await GET(makeRequest());

        expect(response.status).toBe(200);

        await expect(
          response.json(),
        ).resolves.toEqual({
          ok: true,
          expired: 1,
        });

        expect(
          mocks.updatePaymentStatus,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.updatePaymentStatus,
        ).toHaveBeenCalledWith(
          "payment-1",
          "expired",
        );

        expect(
          mocks.orderFindUnique,
        ).toHaveBeenCalledWith({
          where: {
            id: "order-1",
          },
          select: {
            status: true,
          },
        });

        expect(
          mocks.orderFindMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              status: "pending",
              businessUnit: "store",
              inventoryDeducted: false,
              paymentTransactions:
                expect.objectContaining({
                  some:
                    expect.objectContaining({
                      purpose: "order",
                      businessUnit:
                        "store",
                    }),
                }),
            }),
          }),
        );
      },
    );

    it(
      "does not expire an order when its latest replacement checkout is still valid",
      async () => {
        mocks.orderFindMany.mockResolvedValue([
          makeOrder(
            makePayment({
              id: "replacement-payment",
              expiresAt:
                new Date(
                  "2026-09-28T16:20:00.000Z",
                ),
            }),
          ),
        ]);

        const response =
          await GET(makeRequest());

        await expect(
          response.json(),
        ).resolves.toEqual({
          ok: true,
          expired: 0,
        });

        expect(
          mocks.updatePaymentStatus,
        ).not.toHaveBeenCalled();

        expect(
          mocks.orderFindUnique,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "never interferes with an in-progress Store retry claim",
      async () => {
        mocks.orderFindMany.mockResolvedValue([
          makeOrder(
            makePayment({
              status: "retrying",
            }),
          ),
        ]);

        const response =
          await GET(makeRequest());

        await expect(
          response.json(),
        ).resolves.toEqual({
          ok: true,
          expired: 0,
        });

        expect(
          mocks.updatePaymentStatus,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when the current payment has no expiresAt",
      async () => {
        mocks.orderFindMany.mockResolvedValue([
          makeOrder(
            makePayment({
              expiresAt: null,
            }),
          ),
        ]);

        const response =
          await GET(makeRequest());

        await expect(
          response.json(),
        ).resolves.toEqual({
          ok: true,
          expired: 0,
        });

        expect(
          mocks.updatePaymentStatus,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not count the order when a payment webhook wins the race",
      async () => {
        mocks.orderFindMany.mockResolvedValue([
          makeOrder(),
        ]);

        mocks.updatePaymentStatus.mockResolvedValue(
          {
            status: "paid",
          },
        );

        const response =
          await GET(makeRequest());

        await expect(
          response.json(),
        ).resolves.toEqual({
          ok: true,
          expired: 0,
        });

        expect(
          mocks.orderFindUnique,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "treats processing as an expirable open payment status",
      async () => {
        mocks.orderFindMany.mockResolvedValue([
          makeOrder(
            makePayment({
              status: "processing",
            }),
          ),
        ]);

        mocks.updatePaymentStatus.mockResolvedValue(
          {
            status: "expired",
          },
        );

        mocks.orderFindUnique.mockResolvedValue({
          status: "cancelled",
        });

        const response =
          await GET(makeRequest());

        await expect(
          response.json(),
        ).resolves.toEqual({
          ok: true,
          expired: 1,
        });

        expect(
          mocks.updatePaymentStatus,
        ).toHaveBeenCalledWith(
          "payment-1",
          "expired",
        );
      },
    );
  },
);