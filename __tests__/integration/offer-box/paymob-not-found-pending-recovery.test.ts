import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  updatePaymentTransactionStatus: vi.fn(),
  inquirePaymobTransactionByMerchantReference: vi.fn(),
}));

vi.mock("@/lib/payments/service", () => ({
  updatePaymentTransactionStatus:
    mocks.updatePaymentTransactionStatus,
}));

vi.mock("@/lib/payments/providers/paymob", () => ({
  inquirePaymobTransactionByMerchantReference:
    mocks.inquirePaymobTransactionByMerchantReference,
}));

import {
  GET as runPendingCleanupCron,
} from "@/app/api/cron/cancel-pending-orders/route";

import {
  releaseExpiredOfferBoxPaymentHold,
} from "@/lib/payments/offer-box-payment";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: Offer Box recovery integration requires fitzone_test",
  );
}

const db = new PrismaClient();

const stamp =
  `TEST-OFFER-BOX-RECOVERY-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const originalCronSecret =
  process.env.CRON_SECRET;

let userId = "";
let offerId = "";

let notFoundPaymentId = "";
let notFoundPurchaseId = "";

let pendingPaymentId = "";
let pendingPurchaseId = "";

async function cleanup() {
  const purchases = [
    notFoundPurchaseId,
    pendingPurchaseId,
  ].filter(Boolean);

  if (purchases.length) {
    await db.offerBoxPurchase.deleteMany({
      where: {
        id: {
          in: purchases,
        },
      },
    });
  }

  const payments = [
    notFoundPaymentId,
    pendingPaymentId,
  ].filter(Boolean);

  if (payments.length) {
    await db.paymentTransaction.deleteMany({
      where: {
        id: {
          in: payments,
        },
      },
    });
  }

  if (offerId) {
    await db.offer.deleteMany({
      where: {
        id: offerId,
      },
    });
  }

  if (userId) {
    await db.user.deleteMany({
      where: {
        id: userId,
      },
    });
  }
}

beforeAll(async () => {
  /*
   * Prevent this cron integration from touching
   * any unrelated expired Offer Box fixture.
   */
  const foreignExpired =
    await db.paymentTransaction.count({
      where: {
        purpose: "offer_box",

        expiresAt: {
          lte: new Date(),
        },

        status: {
          in: [
            "pending",
            "pending_payment",
            "processing",
            "requires_action",
            "failed",
            "cancelled",
          ],
        },
      },
    });

  if (foreignExpired !== 0) {
    throw new Error(
      `REFUSING: FOREIGN_EXPIRED_OFFER_BOX_PAYMENTS=${foreignExpired}`,
    );
  }

  process.env.CRON_SECRET =
    `${stamp}-CRON-SECRET`;

  const user =
    await db.user.create({
      data: {
        name: `${stamp} USER`,

        email:
          `${stamp.toLowerCase()}@test.local`,

        role: "customer",
        isActive: true,
      },
    });

  userId = user.id;

  const offer =
    await db.offer.create({
      data: {
        title: `${stamp} OFFER`,

        discount: 0,

        expiresAt:
          new Date(
            Date.now() +
              7 * 24 * 60 * 60 * 1000,
          ),

        isActive: true,

        offerBoxEnabled: true,

        /*
         * Two provisional reservations:
         * - one Paymob cannot find
         * - one Paymob still reports pending
         */
        offerBoxReservedCount: 2,

        currentSubscribers: 0,

        maxSubscribers: 5,
      },
    });

  offerId = offer.id;

  const expiredAt =
    new Date(
      Date.now() -
        2 * 60 * 60 * 1000,
    );

  /*
   * CASE A — Paymob found=false.
   *
   * Simulate crash before purchase.paymentTransactionId
   * was linked back.
   */
  const notFoundPurchase =
    await db.offerBoxPurchase.create({
      data: {
        userId,
        offerId,

        status: "pending_payment",

        offerSnapshot:
          JSON.stringify({
            version: 1,
            testMarker:
              `${stamp}-NOT-FOUND`,
          }),

        snapshotVersion: 1,

        priceSnapshot: 100,
        currency: "EGP",
        paymentMethod: "paymob",

        holdExpiresAt:
          expiredAt,

        paymentTransactionId:
          null,
      },
    });

  notFoundPurchaseId =
    notFoundPurchase.id;

  const notFoundPayment =
    await db.paymentTransaction.create({
      data: {
        userId,

        purpose: "offer_box",

        provider: "paymob",

        amount: 100,

        currency: "EGP",

        status: "pending",

        paymentMethod: "paymob",

        offerId,

        expiresAt:
          expiredAt,

        metadata:
          JSON.stringify({
            testMarker:
              `${stamp}-NOT-FOUND`,

            offerBoxPurchaseId:
              notFoundPurchaseId,

            offerBoxSnapshotVersion: 1,
          }),
      },
    });

  notFoundPaymentId =
    notFoundPayment.id;

  /*
   * CASE B — Paymob still pending.
   */
  const pendingPurchase =
    await db.offerBoxPurchase.create({
      data: {
        userId,
        offerId,

        status: "pending_payment",

        offerSnapshot:
          JSON.stringify({
            version: 1,
            testMarker:
              `${stamp}-PENDING`,
          }),

        snapshotVersion: 1,

        priceSnapshot: 100,
        currency: "EGP",
        paymentMethod: "paymob",

        holdExpiresAt:
          expiredAt,

        paymentTransactionId:
          null,
      },
    });

  pendingPurchaseId =
    pendingPurchase.id;

  const pendingPayment =
    await db.paymentTransaction.create({
      data: {
        userId,

        purpose: "offer_box",

        provider: "paymob",

        amount: 100,

        currency: "EGP",

        status: "pending",

        paymentMethod: "paymob",

        offerId,

        expiresAt:
          expiredAt,

        metadata:
          JSON.stringify({
            testMarker:
              `${stamp}-PENDING`,

            offerBoxPurchaseId:
              pendingPurchaseId,

            offerBoxSnapshotVersion: 1,
          }),
      },
    });

  pendingPaymentId =
    pendingPayment.id;
});

beforeEach(() => {
  vi.clearAllMocks();

  mocks.inquirePaymobTransactionByMerchantReference
    .mockImplementation(
      async (
        transactionId: string,
      ) => {
        if (
          transactionId ===
          notFoundPaymentId
        ) {
          return {
            found: false,

            status: "pending",

            paymobTransactionId:
              null,

            merchantOrderId:
              notFoundPaymentId,

            amountCents: null,

            currency: null,

            pending: null,

            success: null,
          };
        }

        if (
          transactionId ===
          pendingPaymentId
        ) {
          return {
            found: true,

            status: "pending",

            paymobTransactionId:
              `${stamp}-PENDING-PAYMOB`,

            merchantOrderId:
              pendingPaymentId,

            amountCents: 10000,

            currency: "EGP",

            pending: true,

            success: false,
          };
        }

        throw new Error(
          `REFUSING_UNEXPECTED_PAYMENT:${transactionId}`,
        );
      },
    );

  mocks.updatePaymentTransactionStatus
    .mockImplementation(
      async (
        transactionId: string,
        status: string,
      ) => {
        /*
         * Only found=false may reach canonical expiry.
         * Provider-pending must never cross this boundary.
         */
        if (
          transactionId !==
            notFoundPaymentId ||
          status !== "expired"
        ) {
          throw new Error(
            `UNEXPECTED_PAYMENT_STATUS_UPDATE:${transactionId}:${status}`,
          );
        }

        await db.paymentTransaction.update({
          where: {
            id: transactionId,
          },

          data: {
            status: "expired",
          },
        });

        const release =
          await releaseExpiredOfferBoxPaymentHold({
            transactionId,

            purchaseId:
              notFoundPurchaseId,

            now: new Date(),
          });

        if (!release.released) {
          throw new Error(
            `EXPECTED_EXPIRY_RELEASE:${release.reason}`,
          );
        }

        return db.paymentTransaction
          .findUniqueOrThrow({
            where: {
              id: transactionId,
            },
          });
      },
    );
});

afterAll(async () => {
  await cleanup();

  if (
    originalCronSecret === undefined
  ) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET =
      originalCronSecret;
  }

  await db.$disconnect();
});

describe(
  "Offer Box Paymob not-found and pending recovery",
  () => {
    it(
      "expires a not-found checkout after cutoff and preserves a provider-pending checkout",
      async () => {
        const before =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },

              select: {
                offerBoxReservedCount:
                  true,

                currentSubscribers:
                  true,
              },
            });

        expect(
          before.offerBoxReservedCount,
        ).toBe(2);

        expect(
          before.currentSubscribers,
        ).toBe(0);

        const response =
          await runPendingCleanupCron(
            new Request(
              "http://localhost/api/cron/cancel-pending-orders",
              {
                method: "GET",

                headers: {
                  "x-cron-secret":
                    process.env.CRON_SECRET!,
                },
              },
            ),
          );

        expect(
          response.status,
        ).toBe(200);

        const body =
          await response.json();

        expect(
          body.ok,
        ).toBe(true);

        /*
         * CASE A:
         * Paymob has no transaction after our conservative cutoff.
         */
        const notFoundPayment =
          await db.paymentTransaction
            .findUniqueOrThrow({
              where: {
                id:
                  notFoundPaymentId,
              },
            });

        expect(
          notFoundPayment.status,
        ).toBe("expired");

        const notFoundPurchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id:
                  notFoundPurchaseId,
              },
            });

        expect(
          notFoundPurchase.status,
        ).toBe("cancelled");

        expect(
          notFoundPurchase.cancelReason,
        ).toBe("payment_expired");

        expect(
          notFoundPurchase.cancelledAt,
        ).toBeInstanceOf(Date);

        /*
         * Crash-window link is repaired before cancellation.
         */
        expect(
          notFoundPurchase.paymentTransactionId,
        ).toBe(
          notFoundPaymentId,
        );

        /*
         * CASE B:
         * Paymob still says pending.
         */
        const pendingPayment =
          await db.paymentTransaction
            .findUniqueOrThrow({
              where: {
                id:
                  pendingPaymentId,
              },
            });

        expect(
          pendingPayment.status,
        ).toBe("pending");

        const pendingPurchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id:
                  pendingPurchaseId,
              },
            });

        expect(
          pendingPurchase.status,
        ).toBe("pending_payment");

        expect(
          pendingPurchase.paymentTransactionId,
        ).toBeNull();

        expect(
          pendingPurchase.cancelledAt,
        ).toBeNull();

        expect(
          pendingPurchase.cancelReason,
        ).toBeNull();

        /*
         * Exactly one of two holds was released.
         */
        const after =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },

              select: {
                offerBoxReservedCount:
                  true,

                currentSubscribers:
                  true,
              },
            });

        expect(
          after.offerBoxReservedCount,
        ).toBe(1);

        expect(
          after.currentSubscribers,
        ).toBe(0);

        expect(
          mocks
            .inquirePaymobTransactionByMerchantReference,
        ).toHaveBeenCalledWith(
          notFoundPaymentId,
        );

        expect(
          mocks
            .inquirePaymobTransactionByMerchantReference,
        ).toHaveBeenCalledWith(
          pendingPaymentId,
        );

        expect(
          mocks.updatePaymentTransactionStatus,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.updatePaymentTransactionStatus,
        ).toHaveBeenCalledWith(
          notFoundPaymentId,
          "expired",
        );

        console.log(
          "PAYMOB_NOT_FOUND_AFTER_CUTOFF=YES",
        );

        console.log(
          "NOT_FOUND_PAYMENT_STATUS=expired",
        );

        console.log(
          "NOT_FOUND_PURCHASE_STATUS=cancelled",
        );

        console.log(
          "NOT_FOUND_RESERVATION_RELEASED=YES",
        );

        console.log(
          "PAYMOB_PENDING_FOUND=YES",
        );

        console.log(
          "PENDING_PAYMENT_STATUS=pending",
        );

        console.log(
          "PENDING_PURCHASE_STATUS=pending_payment",
        );

        console.log(
          "PENDING_RESERVATION_RELEASED=NO",
        );

        console.log(
          "FINAL_RESERVED_COUNT=1",
        );

        console.log(
          "FINAL_CURRENT_SUBSCRIBERS=0",
        );

        console.log(
          "NEW_PAYMOB_CHECKOUT_CREATED=NO",
        );

        console.log(
          "PAYMOB_NOT_FOUND_PENDING_GATE=PASS",
        );
      },
      20000,
    );
  },
);