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
  reconcilePaidOfferBoxPurchase,
} from "@/lib/payments/offer-box-payment";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error(
    "REFUSING: DATABASE_URL missing",
  );
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !==
    "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: ambiguous recovery test requires fitzone_test",
  );
}

const db = new PrismaClient();

const stamp =
  `TEST-OFFER-BOX-AMBIG-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const originalCronSecret =
  process.env.CRON_SECRET;

let userId = "";
let offerId = "";

let paidPurchaseId = "";
let paidPaymentId = "";

let errorPurchaseId = "";
let errorPaymentId = "";

async function cleanup() {
  const purchases = [
    paidPurchaseId,
    errorPurchaseId,
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
    paidPaymentId,
    errorPaymentId,
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
   * Refuse to run the cron against unrelated expired
   * Offer Box fixtures.
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
        name:
          `${stamp} USER`,

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
        title:
          `${stamp} OFFER`,

        discount: 0,

        expiresAt:
          new Date(
            Date.now() +
              7 * 24 * 60 * 60 * 1000,
          ),

        isActive: true,

        offerBoxEnabled: true,

        /*
         * One reservation for each ambiguity case.
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
   * CASE A:
   * Purchase reservation exists, but crash happened before
   * paymentTransactionId could be linked back to it.
   */
  const paidPurchase =
    await db.offerBoxPurchase.create({
      data: {
        userId,
        offerId,

        status: "pending_payment",

        offerSnapshot:
          JSON.stringify({
            version: 1,
            testMarker:
              `${stamp}-PAID`,
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

  paidPurchaseId =
    paidPurchase.id;

  const paidPayment =
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
              `${stamp}-PAID`,

            offerBoxPurchaseId:
              paidPurchaseId,

            offerBoxSnapshotVersion: 1,
          }),
      },
    });

  paidPaymentId =
    paidPayment.id;

  /*
   * CASE B:
   * Same ambiguity window, but Paymob inquiry itself fails.
   * Must fail closed and preserve reservation.
   */
  const errorPurchase =
    await db.offerBoxPurchase.create({
      data: {
        userId,
        offerId,

        status: "pending_payment",

        offerSnapshot:
          JSON.stringify({
            version: 1,
            testMarker:
              `${stamp}-ERROR`,
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

  errorPurchaseId =
    errorPurchase.id;

  const errorPayment =
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
              `${stamp}-ERROR`,

            offerBoxPurchaseId:
              errorPurchaseId,

            offerBoxSnapshotVersion: 1,
          }),
      },
    });

  errorPaymentId =
    errorPayment.id;
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
          paidPaymentId
        ) {
          return {
            found: true,

            status: "paid",

            paymobTransactionId:
              `${stamp}-PAYMOB-RECOVERED`,

            merchantOrderId:
              paidPaymentId,

            amountCents: 10000,

            currency: "EGP",

            pending: false,

            success: true,
          };
        }

        if (
          transactionId ===
          errorPaymentId
        ) {
          throw new Error(
            "TEST_PAYMOB_INQUIRY_TRANSPORT_FAILURE",
          );
        }

        /*
         * Any unrelated Offer Box row is fail-closed.
         */
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
         * Only the recovered-paid transaction is allowed
         * to cross this mocked service boundary.
         */
        if (
          transactionId !==
            paidPaymentId ||
          status !== "paid"
        ) {
          throw new Error(
            `UNEXPECTED_PAYMENT_STATUS_UPDATE:${transactionId}:${status}`,
          );
        }

        const paidAt =
          new Date();

        const updated =
          await db.paymentTransaction.update({
            where: {
              id:
                transactionId,
            },

            data: {
              status: "paid",
              paidAt,
            },
          });

        /*
         * Use the REAL Offer Box reconciliation helper.
         * This proves crash-window payment linking and
         * pending_payment -> available repair.
         */
        await reconcilePaidOfferBoxPurchase({
          transactionId,
          purchaseId:
            paidPurchaseId,
          paidAt,
        });

        return updated;
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
  "Offer Box ambiguous Paymob recovery",
  () => {
    it(
      "recovers a remotely-paid checkout and fails closed when inquiry errors",
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

        const consoleError =
          vi.spyOn(
            console,
            "error",
          ).mockImplementation(
            () => {},
          );

        let response: Response;

        try {
          response =
            await runPendingCleanupCron(
              new Request(
                "http://localhost/api/cron/cancel-pending-orders",
                {
                  method: "GET",

                  headers: {
                    "x-cron-secret":
                      process.env
                        .CRON_SECRET!,
                  },
                },
              ),
            );
        } finally {
          /*
           * Keep the expected fail-closed branch
           * from polluting test output.
           */
          consoleError.mockRestore();
        }

        expect(
          response!.status,
        ).toBe(200);

        const body =
          await response!.json();

        expect(
          body.ok,
        ).toBe(true);

        /*
         * PAID RECOVERY
         */
        const paidPayment =
          await db.paymentTransaction
            .findUniqueOrThrow({
              where: {
                id:
                  paidPaymentId,
              },
            });

        expect(
          paidPayment.status,
        ).toBe("paid");

        expect(
          paidPayment.externalReference,
        ).toBe(
          `${stamp}-PAYMOB-RECOVERED`,
        );

        expect(
          paidPayment.paidAt,
        ).toBeInstanceOf(Date);

        const paidPurchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id:
                  paidPurchaseId,
              },
            });

        expect(
          paidPurchase.status,
        ).toBe("available");

        expect(
          paidPurchase.paymentTransactionId,
        ).toBe(
          paidPaymentId,
        );

        expect(
          paidPurchase.paidAt,
        ).toBeInstanceOf(Date);

        expect(
          paidPurchase.cancelledAt,
        ).toBeNull();

        /*
         * FAIL-CLOSED INQUIRY ERROR
         */
        const errorPayment =
          await db.paymentTransaction
            .findUniqueOrThrow({
              where: {
                id:
                  errorPaymentId,
              },
            });

        expect(
          errorPayment.status,
        ).toBe("pending");

        expect(
          errorPayment.externalReference,
        ).toBeNull();

        const errorPurchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id:
                  errorPurchaseId,
              },
            });

        expect(
          errorPurchase.status,
        ).toBe("pending_payment");

        expect(
          errorPurchase.paymentTransactionId,
        ).toBeNull();

        expect(
          errorPurchase.cancelledAt,
        ).toBeNull();

        expect(
          errorPurchase.cancelReason,
        ).toBeNull();

        /*
         * Neither branch may consume/release the
         * customer's reserved entitlement here.
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
        ).toBe(2);

        expect(
          after.currentSubscribers,
        ).toBe(0);

        expect(
          mocks
            .inquirePaymobTransactionByMerchantReference,
        ).toHaveBeenCalledWith(
          paidPaymentId,
        );

        expect(
          mocks
            .inquirePaymobTransactionByMerchantReference,
        ).toHaveBeenCalledWith(
          errorPaymentId,
        );

        expect(
          mocks.updatePaymentTransactionStatus,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.updatePaymentTransactionStatus,
        ).toHaveBeenCalledWith(
          paidPaymentId,
          "paid",
        );

        console.log(
          "AMBIGUOUS_PAYMOB_PAID_FOUND=YES",
        );

        console.log(
          "RECOVERED_EXTERNAL_REFERENCE_PERSISTED=YES",
        );

        console.log(
          "RECOVERED_PAYMENT_STATUS=paid",
        );

        console.log(
          "RECOVERED_PURCHASE_STATUS=available",
        );

        console.log(
          "CRASH_WINDOW_PAYMENT_LINK_REPAIRED=YES",
        );

        console.log(
          "INQUIRY_ERROR_FAIL_CLOSED=YES",
        );

        console.log(
          "ERROR_PURCHASE_STATUS=pending_payment",
        );

        console.log(
          "ERROR_RESERVATION_RELEASED=NO",
        );

        console.log(
          "OFFER_BOX_RESERVED_COUNT=2",
        );

        console.log(
          "OFFER_CURRENT_SUBSCRIBERS=0",
        );

        console.log(
          "NEW_PAYMOB_CHECKOUT_CREATED=NO",
        );

        console.log(
          "AMBIGUOUS_RECOVERY_GATE=PASS",
        );
      },
      20000,
    );
  },
);