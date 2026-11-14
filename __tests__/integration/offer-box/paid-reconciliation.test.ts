{
  const r15zaqRaw = process.env.DATABASE_URL;
  if (!r15zaqRaw ||
      process.env.DIRECT_URL !== r15zaqRaw ||
      process.env.TEST_DATABASE_URL !== r15zaqRaw ||
      process.env.APP_ENV !== "test" ||
      process.env.NODE_ENV !== "test" ||
      process.env.FITZONE_R13_ISOLATED_INTEGRATION !== "1") {
    throw new Error("R15ZAQ_R13_ENVIRONMENT_REJECTED");
  }
  const r15zaqTarget = new URL(r15zaqRaw);
  if (
    r15zaqTarget.protocol !== "mysql:" ||
    r15zaqTarget.hostname !== "127.0.0.1" ||
    r15zaqTarget.port !== "3306" ||
    decodeURIComponent(r15zaqTarget.username) !== "fitzone_r13_user" ||
    r15zaqTarget.pathname !== "/fitzone_final_release_r13_test"
  ) {
    throw new Error("R15ZAQ_R13_DATABASE_IDENTITY_REJECTED");
  }
}
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";
import { getPaymentProvider } from "@/lib/payments/registry";

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
    "fitzone_r13_user" ||
  url.pathname !== "/fitzone_final_release_r13_test"
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
            commercial: {
              currency: "EGP",
              finalPrice: 100,
            },
            economics: {
              commissionSnapshot: JSON.stringify({
                version: 1,
                capturedAt: new Date().toISOString(),
              }),
            },
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

  // Central payment replay resolves the purchase through frozen metadata.
  await db.paymentTransaction.update({
    where: { id: paymentId },
    data: {
      metadata: JSON.stringify({
        testMarker: stamp,
        offerBoxPurchaseId: purchaseId,
        offerBoxSnapshotVersion: 1,
      }),
    },
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
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

        const provider = getPaymentProvider("paymob");
        if (!provider) {
          throw new Error("TEST_PAYMOB_PROVIDER_MISSING");
        }

        const verifiedOrder = vi.spyOn(
          provider,
          "verifyTransaction",
        ).mockResolvedValue({
          status: "paid",
          message: "Isolated verified Order fixture",
        });

        // Local paid state is NOT sufficient for direct reconciliation.
        await expect(
          reconcilePaidOfferBoxPurchase({
            transactionId: paymentId,
            purchaseId,
            paidAt,
            paymobOrderPaidVerified: false,
          }),
        ).rejects.toThrow(
          "OFFER_BOX_PAYMOB_PAID_PROOF_REQUIRED",
        );

        const beforeVerified = await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: purchaseId },
        });
        expect(beforeVerified.status).toBe("pending_payment");
        expect(beforeVerified.paymentTransactionId).toBeNull();

        // Enter through the existing central Order authority instead.
        const first = await updatePaymentTransactionStatus(
          paymentId,
          "paid",
        );

        expect(first.status).toBe("paid");
        expect(verifiedOrder).toHaveBeenCalledTimes(1);

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

        const second = await updatePaymentTransactionStatus(
          paymentId,
          "paid",
        );

        expect(second.status).toBe("paid");
        expect(verifiedOrder).toHaveBeenCalledTimes(2);

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