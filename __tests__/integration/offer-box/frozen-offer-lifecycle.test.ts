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
    "REFUSING: Offer Box lifecycle integration requires fitzone_test",
  );
}

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  applyMembershipBookingPlanTx: vi.fn(),
  applyMembershipSessionCarryoverTx: vi.fn(),
  isBlockingMembershipCarryoverReason: vi.fn(),
  lockMembershipLifecycleUserTx: vi.fn(),
  runPaidMembershipPostActivationReconciliation: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/payments/membership-booking-plan", () => ({
  MembershipBookingPlanError:
    class MembershipBookingPlanError extends Error {
      action: unknown;

      constructor(
        message = "booking plan test error",
        action: unknown = null,
      ) {
        super(message);
        this.action = action;
      }
    },

  applyMembershipBookingPlanTx:
    mocks.applyMembershipBookingPlanTx,
}));

vi.mock("@/lib/membership-session-carryover", () => ({
  applyMembershipSessionCarryoverTx:
    mocks.applyMembershipSessionCarryoverTx,

  isBlockingMembershipCarryoverReason:
    mocks.isBlockingMembershipCarryoverReason,
}));

vi.mock("@/lib/membership-lifecycle-lock", () => ({
  lockMembershipLifecycleUserTx:
    mocks.lockMembershipLifecycleUserTx,
}));

vi.mock("@/lib/payments/reconciliation-helper", () => ({
  runPaidMembershipPostActivationReconciliation:
    mocks.runPaidMembershipPostActivationReconciliation,
}));

import {
  POST as redeemOfferBox,
} from "@/app/api/offer-box/redeem/route";

const db = new PrismaClient();

const stamp =
  `TEST-OFFER-BOX-FROZEN-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

let userId = "";
let membershipId = "";
let offerId = "";
let paymentId = "";
let purchaseId = "";

async function cleanup() {
  if (purchaseId) {
    await db.offerBoxPurchase.deleteMany({
      where: { id: purchaseId },
    });
  }

  if (paymentId) {
    await db.paymentTransaction.deleteMany({
      where: { id: paymentId },
    });
  }

  if (userId) {
    await db.booking.deleteMany({
      where: { userId },
    });

    await db.userMembership.deleteMany({
      where: { userId },
    });
  }

  if (offerId) {
    await db.offer.deleteMany({
      where: { id: offerId },
    });
  }

  if (membershipId) {
    await db.membership.deleteMany({
      where: { id: membershipId },
    });
  }

  if (userId) {
    await db.user.deleteMany({
      where: { id: userId },
    });
  }
}

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      name: `${stamp} USER`,
      email: `${stamp.toLowerCase()}@test.local`,
      role: "customer",
      isActive: true,
    },
  });

  userId = user.id;

  const membership = await db.membership.create({
    data: {
      name: `${stamp} MEMBERSHIP`,
      nameEn: `${stamp} MEMBERSHIP`,
      price: 100,
      duration: 30,
      features: "[]",
      isActive: true,
      kind: "subscription",
      coachMembershipEnabled: false,
    },
  });

  membershipId = membership.id;

  const futureExpiry =
    new Date(
      Date.now() +
        7 * 24 * 60 * 60 * 1000,
    );

  const offer = await db.offer.create({
    data: {
      title: `${stamp} OFFER`,
      titleEn: `${stamp} OFFER`,
      discount: 0,
      expiresAt: futureExpiry,
      isActive: true,

      offerBoxEnabled: true,
      offerBoxReservedCount: 1,

      currentSubscribers: 0,
      maxSubscribers: 2,
    },
  });

  offerId = offer.id;

  const purchasedAt = new Date();

  const snapshot = {
    version: 1,
    purchasedAt:
      purchasedAt.toISOString(),

    offer: {
      id: offerId,
      title: `${stamp} OFFER`,
      titleEn: `${stamp} OFFER`,
      type: "membership",
      discount: 0,
      description: null,
      descriptionEn: null,
      appliesTo: null,
      appliesToEn: null,

      expiresAtAtPurchase:
        futureExpiry.toISOString(),

      membershipId,

      sessionsCount: null,
      durationDays: 30,

      priceBefore: 100,
      specialPrice: 100,

      features: [],
      featuresEn: [],
    },

    membershipTemplate: {
      sourceMembershipId:
        membershipId,

      name:
        `${stamp} MEMBERSHIP`,

      nameEn:
        `${stamp} MEMBERSHIP`,

      kind: "subscription",

      durationDays: 30,
      sessionsCount: null,

      walletBonus: 0,
      productRewards: null,
    },

    commercial: {
      currency: "EGP",
      originalPrice: 100,
      finalPrice: 100,
    },

    eligibilitySnapshot: {},

    economics: {
      commissionSnapshot:
        JSON.stringify({
          testMarker: stamp,
        }),

      attributionMode:
        "direct_offer_box",
    },

    ageEligibility: {
      requiresBirthDate: false,
      minAgeYears: null,
      maxAgeYears: null,
      ageYearsAtPurchase: null,
      validatedAt:
        purchasedAt.toISOString(),
    },
  };

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
        paidAt: purchasedAt,

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

        status: "available",

        offerSnapshot:
          JSON.stringify(snapshot),

        snapshotVersion: 1,

        priceSnapshot: 100,
        currency: "EGP",
        paymentMethod: "paymob",

        paymentTransactionId:
          paymentId,

        paidAt: purchasedAt,
        holdExpiresAt: null,
      },
    });

  purchaseId = purchase.id;

  /*
   * Simulate lifecycle changes AFTER successful purchase.
   *
   * The customer must keep the purchased entitlement.
   */
  await db.offer.update({
    where: {
      id: offerId,
    },
    data: {
      isActive: false,
      expiresAt:
        new Date(
          Date.now() -
            24 * 60 * 60 * 1000,
        ),
    },
  });
});

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getCurrentAppUser
    .mockResolvedValue({
      id: userId,
      name: `${stamp} USER`,
      email:
        `${stamp.toLowerCase()}@test.local`,
    });

  mocks.lockMembershipLifecycleUserTx
    .mockResolvedValue(undefined);

  mocks.applyMembershipBookingPlanTx
    .mockResolvedValue({
      bookedSchedules: [],
    });

  mocks.applyMembershipSessionCarryoverTx
    .mockResolvedValue({
      eligible: false,
      reason:
        "no_previous_membership",
      carryoverSessions: 0,
    });

  mocks.isBlockingMembershipCarryoverReason
    .mockReturnValue(false);

  mocks.runPaidMembershipPostActivationReconciliation
    .mockResolvedValue(undefined);
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe(
  "Offer Box frozen offer lifecycle",
  () => {
    it(
      "redeems a paid right after the live offer becomes inactive and expired",
      async () => {
        const liveBefore =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },
            });

        expect(
          liveBefore.isActive,
        ).toBe(false);

        expect(
          liveBefore.expiresAt.getTime(),
        ).toBeLessThan(
          Date.now(),
        );

        const response =
          await redeemOfferBox(
            new Request(
              "http://localhost/api/offer-box/redeem",
              {
                method: "POST",
                headers: {
                  "content-type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    purchaseId,
                    scheduleIds: [],
                  }),
              },
            ),
          );

        const body =
          await response.json();

        expect(
          response.status,
          JSON.stringify(body),
        ).toBe(200);

        expect(
          body.success,
        ).toBe(true);

        expect(
          body.alreadyRedeemed,
        ).toBe(false);

        expect(
          typeof body.membership?.id,
        ).toBe("string");

        const purchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        expect(
          purchase.status,
        ).toBe("redeemed");

        expect(
          purchase.redeemedUserMembershipId,
        ).toBe(
          body.membership.id,
        );

        const liveAfter =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },
              select: {
                isActive: true,
                expiresAt: true,
                offerBoxReservedCount:
                  true,
                currentSubscribers:
                  true,
              },
            });

        /*
         * Redeem must not reactivate or extend
         * the live Offer definition.
         */
        expect(
          liveAfter.isActive,
        ).toBe(false);

        expect(
          liveAfter.expiresAt.getTime(),
        ).toBeLessThan(
          Date.now(),
        );

        /*
         * Only the purchased reservation is converted.
         */
        expect(
          liveAfter.offerBoxReservedCount,
        ).toBe(0);

        expect(
          liveAfter.currentSubscribers,
        ).toBe(1);

        const activated =
          await db.userMembership
            .findUniqueOrThrow({
              where: {
                id:
                  body.membership.id,
              },
            });

        expect(
          activated.status,
        ).toBe("active");

        expect(
          activated.userId,
        ).toBe(userId);

        expect(
          activated.membershipId,
        ).toBe(membershipId);

        expect(
          activated.offerId,
        ).toBe(offerId);

        expect(
          mocks.applyMembershipBookingPlanTx,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.runPaidMembershipPostActivationReconciliation,
        ).toHaveBeenCalledTimes(1);

        console.log(
          "LIVE_OFFER_ACTIVE_AT_REDEEM=NO",
        );

        console.log(
          "LIVE_OFFER_EXPIRED_AT_REDEEM=YES",
        );

        console.log(
          "PURCHASED_RIGHT_REDEEMED=YES",
        );

        console.log(
          "LIVE_OFFER_NOT_REACTIVATED=PASS",
        );

        console.log(
          "OFFER_BOX_RESERVED_COUNT_AFTER_REDEEM=0",
        );

        console.log(
          "OFFER_CURRENT_SUBSCRIBERS_AFTER_REDEEM=1",
        );

        console.log(
          "FROZEN_OFFER_LIFECYCLE_GATE=PASS",
        );

        console.log(
          "EXTERNAL_PAYMENT_PROVIDER_CALLED=NO",
        );
      },
      20000,
    );
  },
);