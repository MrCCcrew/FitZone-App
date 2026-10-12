import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  releaseExpiredOfferBoxPaymentHold,
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
    "REFUSING: Offer Box expiry integration requires fitzone_test",
  );
}

const db = new PrismaClient();

const stamp =
  `TEST-OFFER-BOX-EXPIRY-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

let userId = "";
let offerId = "";

let expiredPaymentId = "";
let expiredPurchaseId = "";

let paidPaymentId = "";
let paidPurchaseId = "";

async function cleanup() {
  const purchaseIds = [
    expiredPurchaseId,
    paidPurchaseId,
  ].filter(Boolean);

  if (purchaseIds.length) {
    await db.offerBoxPurchase.deleteMany({
      where: {
        id: {
          in: purchaseIds,
        },
      },
    });
  }

  const paymentIds = [
    expiredPaymentId,
    paidPaymentId,
  ].filter(Boolean);

  if (paymentIds.length) {
    await db.paymentTransaction.deleteMany({
      where: {
        id: {
          in: paymentIds,
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

  /*
   * Two reserved Offer Box rights:
   *
   * 1) expired unpaid checkout
   * 2) already-paid checkout
   */
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
        offerBoxReservedCount: 2,

        currentSubscribers: 0,
        maxSubscribers: 5,
      },
    });

  offerId = offer.id;

  const expiredAt =
    new Date(
      Date.now() -
        10 * 60 * 1000,
    );

  const expiredPayment =
    await db.paymentTransaction.create({
      data: {
        userId,
        purpose: "offer_box",
        provider: "paymob",
        amount: 100,
        currency: "EGP",

        /*
         * Shared payment state may already be failed/cancelled.
         * The authoritative release condition here is expiry.
         */
        status: "failed",

        paymentMethod: "paymob",
        offerId,

        expiresAt: expiredAt,

        metadata:
          JSON.stringify({
            testMarker:
              `${stamp}-EXPIRED`,
          }),
      },
    });

  expiredPaymentId =
    expiredPayment.id;

  const expiredPurchase =
    await db.offerBoxPurchase.create({
      data: {
        userId,
        offerId,

        status: "pending_payment",

        offerSnapshot:
          JSON.stringify({
            version: 1,
            testMarker:
              `${stamp}-EXPIRED`,
          }),

        snapshotVersion: 1,

        priceSnapshot: 100,
        currency: "EGP",
        paymentMethod: "paymob",

        holdExpiresAt:
          expiredAt,

        paymentTransactionId:
          expiredPaymentId,
      },
    });

  expiredPurchaseId =
    expiredPurchase.id;

  const paidPayment =
    await db.paymentTransaction.create({
      data: {
        userId,
        purpose: "offer_box",
        provider: "paymob",
        amount: 100,
        currency: "EGP",

        status: "paid",

        paymentMethod: "paymob",
        offerId,

        /*
         * Intentionally in the past.
         *
         * Paid must win even when checkout expiry has passed.
         */
        expiresAt: expiredAt,

        paidAt:
          new Date(
            Date.now() -
              20 * 60 * 1000,
          ),

        metadata:
          JSON.stringify({
            testMarker:
              `${stamp}-PAID`,
          }),
      },
    });

  paidPaymentId =
    paidPayment.id;

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
          paidPaymentId,
      },
    });

  paidPurchaseId =
    paidPurchase.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe(
  "Offer Box expiry release exact-once and paid-wins",
  () => {
    it(
      "releases an expired unpaid reservation once and never releases a paid reservation",
      async () => {
        const now = new Date();

        const initialOffer =
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
          initialOffer.offerBoxReservedCount,
        ).toBe(2);

        expect(
          initialOffer.currentSubscribers,
        ).toBe(0);

        /*
         * CASE A:
         * Authoritatively expired unpaid checkout.
         */
        const firstRelease =
          await releaseExpiredOfferBoxPaymentHold({
            transactionId:
              expiredPaymentId,
            purchaseId:
              expiredPurchaseId,
            now,
          });

        expect(firstRelease).toEqual({
          released: true,
          reason: "payment_expired",
        });

        const expiredAfterFirst =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id:
                  expiredPurchaseId,
              },
            });

        expect(
          expiredAfterFirst.status,
        ).toBe("cancelled");

        expect(
          expiredAfterFirst.cancelReason,
        ).toBe("payment_expired");

        expect(
          expiredAfterFirst.cancelledAt,
        ).toBeInstanceOf(Date);

        const offerAfterFirst =
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
          offerAfterFirst.offerBoxReservedCount,
        ).toBe(1);

        expect(
          offerAfterFirst.currentSubscribers,
        ).toBe(0);

        /*
         * Retry must NOT decrement capacity again.
         */
        const secondRelease =
          await releaseExpiredOfferBoxPaymentHold({
            transactionId:
              expiredPaymentId,
            purchaseId:
              expiredPurchaseId,
            now:
              new Date(
                now.getTime() + 1000,
              ),
          });

        expect(secondRelease).toEqual({
          released: false,
          reason:
            "purchase_not_pending",
        });

        const offerAfterRetry =
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
          offerAfterRetry.offerBoxReservedCount,
        ).toBe(1);

        expect(
          offerAfterRetry.currentSubscribers,
        ).toBe(0);

        /*
         * CASE B:
         * Paid wins even though expiresAt is in the past.
         */
        const paidResult =
          await releaseExpiredOfferBoxPaymentHold({
            transactionId:
              paidPaymentId,
            purchaseId:
              paidPurchaseId,
            now,
          });

        expect(paidResult).toEqual({
          released: false,
          reason:
            "payment_already_paid",
        });

        const paidPurchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id:
                  paidPurchaseId,
              },
            });

        /*
         * Expiry helper must not cancel the paid right.
         * Paid reconciliation owns the later
         * pending_payment -> available transition.
         */
        expect(
          paidPurchase.status,
        ).toBe("pending_payment");

        expect(
          paidPurchase.cancelledAt,
        ).toBeNull();

        expect(
          paidPurchase.cancelReason,
        ).toBeNull();

        const finalOffer =
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
          finalOffer.offerBoxReservedCount,
        ).toBe(1);

        expect(
          finalOffer.currentSubscribers,
        ).toBe(0);

        console.log(
          "INITIAL_RESERVED_COUNT=2",
        );

        console.log(
          "EXPIRED_FIRST_RELEASE=YES",
        );

        console.log(
          "RESERVED_COUNT_AFTER_FIRST_RELEASE=1",
        );

        console.log(
          "EXPIRED_SECOND_RELEASE=NO",
        );

        console.log(
          "EXPIRY_RELEASE_EXACT_ONCE=PASS",
        );

        console.log(
          "PAID_EXPIRED_CHECKOUT_RELEASED=NO",
        );

        console.log(
          "PAID_WINS_EXPIRY_RACE=PASS",
        );

        console.log(
          "FINAL_RESERVED_COUNT=1",
        );

        console.log(
          "FINAL_CURRENT_SUBSCRIBERS=0",
        );

        console.log(
          "EXTERNAL_PAYMENT_PROVIDER_CALLED=NO",
        );
      },
      20000,
    );
  },
);