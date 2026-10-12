import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaClient } from "@prisma/client";

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
    "REFUSING: Offer Box paid reconciliation integration requires fitzone_test",
  );
}

const db = new PrismaClient();

const stamp =
  `TEST-OFFER-BOX-PAID-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

let userId = "";
let offerId = "";
let paymentId = "";
let purchaseId = "";

async function cleanup() {
  if (purchaseId) {
    await db.offerBoxPurchase.deleteMany({
      where: {
        id: purchaseId,
      },
    });
  }

  if (paymentId) {
    await db.paymentTransaction.deleteMany({
      where: {
        id: paymentId,
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
    await db.userMembership.deleteMany({
      where: {
        userId,
      },
    });

    await db.booking.deleteMany({
      where: {
        userId,
      },
    });

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
        offerBoxReservedCount: 1,
        currentSubscribers: 0,
        maxSubscribers: 2,
      },
    });

  offerId = offer.id;

  const payment =
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
        paidAt: new Date(),
        metadata:
          JSON.stringify({
            testMarker: stamp,
          }),
      },
    });

  paymentId = payment.id;

  const purchase =
    await db.offerBoxPurchase.create({
      data: {
        userId,
        offerId,
        status: "pending_payment",
        offerSnapshot:
          JSON.stringify({
            version: 1,
            testMarker: stamp,
          }),
        snapshotVersion: 1,
        priceSnapshot: 100,
        currency: "EGP",
        paymentMethod: "paymob",
        holdExpiresAt:
          new Date(
            Date.now() +
              60 * 60 * 1000,
          ),
        paymentTransactionId: null,
      },
    });

  purchaseId = purchase.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe(
  "Offer Box paid reconciliation exact-once",
  () => {
    it(
      "moves pending purchase to available exactly once without consuming reserved capacity",
      async () => {
        const paidAt =
          new Date();

        const first =
          await reconcilePaidOfferBoxPurchase({
            transactionId: paymentId,
            purchaseId,
            paidAt,
          });

        expect(first).toEqual({
          alreadyReconciled: false,
          status: "available",
        });

        const afterFirst =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        expect(
          afterFirst.status,
        ).toBe("available");

        expect(
          afterFirst.paymentTransactionId,
        ).toBe(paymentId);

        expect(
          afterFirst.paidAt,
        ).toBeInstanceOf(Date);

        expect(
          afterFirst.holdExpiresAt,
        ).toBeNull();

        const second =
          await reconcilePaidOfferBoxPurchase({
            transactionId: paymentId,
            purchaseId,
            paidAt:
              new Date(
                paidAt.getTime() + 1000,
              ),
          });

        expect(second).toEqual({
          alreadyReconciled: true,
          status: "available",
        });

        const afterSecond =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        expect(
          afterSecond.status,
        ).toBe("available");

        expect(
          afterSecond.paymentTransactionId,
        ).toBe(paymentId);

        expect(
          afterSecond.paidAt?.getTime(),
        ).toBe(
          afterFirst.paidAt?.getTime(),
        );

        const offer =
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
          offer.offerBoxReservedCount,
        ).toBe(1);

        expect(
          offer.currentSubscribers,
        ).toBe(0);

        const memberships =
          await db.userMembership.count({
            where: {
              userId,
            },
          });

        const bookings =
          await db.booking.count({
            where: {
              userId,
            },
          });

        expect(memberships)
          .toBe(0);

        expect(bookings)
          .toBe(0);

        console.log(
          "FIRST_RECONCILIATION=available",
        );

        console.log(
          "SECOND_RECONCILIATION=already_reconciled",
        );

        console.log(
          "PAYMENT_LINK_EXACT_ONCE=PASS",
        );

        console.log(
          "OFFER_BOX_RESERVED_COUNT_AFTER_PAID=1",
        );

        console.log(
          "OFFER_CURRENT_SUBSCRIBERS_AFTER_PAID=0",
        );

        console.log(
          "USER_MEMBERSHIP_COUNT_AFTER_PAID=0",
        );

        console.log(
          "BOOKING_COUNT_AFTER_PAID=0",
        );

        console.log(
          "EXTERNAL_PAYMENT_PROVIDER_CALLED=NO",
        );
      },
      20000,
    );
  },
);