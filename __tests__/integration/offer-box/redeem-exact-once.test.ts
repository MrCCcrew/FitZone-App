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
    "REFUSING: Offer Box redeem integration requires fitzone_test",
  );
}

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),

  applyMembershipBookingPlanTx:
    vi.fn(),

  applyMembershipSessionCarryoverTx:
    vi.fn(),

  isBlockingMembershipCarryoverReason:
    vi.fn(),

  lockMembershipLifecycleUserTx:
    vi.fn(),

  runPaidMembershipPostActivationReconciliation:
    vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser:
    mocks.getCurrentAppUser,
}));

vi.mock(
  "@/lib/payments/membership-booking-plan",
  () => ({
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
  }),
);

vi.mock(
  "@/lib/membership-session-carryover",
  () => ({
    applyMembershipSessionCarryoverTx:
      mocks.applyMembershipSessionCarryoverTx,

    isBlockingMembershipCarryoverReason:
      mocks.isBlockingMembershipCarryoverReason,
  }),
);

vi.mock(
  "@/lib/membership-lifecycle-lock",
  () => ({
    lockMembershipLifecycleUserTx:
      mocks.lockMembershipLifecycleUserTx,
  }),
);

vi.mock(
  "@/lib/payments/reconciliation-helper",
  () => ({
    runPaidMembershipPostActivationReconciliation:
      mocks.runPaidMembershipPostActivationReconciliation,
  }),
);

import {
  POST as redeemOfferBox,
} from "@/app/api/offer-box/redeem/route";

const db = new PrismaClient();

const stamp =
  `TEST-OFFER-BOX-REDEEM-${Date.now()}-${Math.random()
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

  if (userId) {
    await db.booking.deleteMany({
      where: {
        userId,
      },
    });

    await db.userMembership.deleteMany({
      where: {
        userId,
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

  if (membershipId) {
    await db.membership.deleteMany({
      where: {
        id: membershipId,
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

  const membership =
    await db.membership.create({
      data: {
        name:
          `${stamp} MEMBERSHIP`,
        nameEn:
          `${stamp} MEMBERSHIP`,
        price: 100,
        duration: 30,
        features: "[]",
        isActive: true,
        kind: "subscription",
        coachMembershipEnabled: false,
      },
    });

  membershipId = membership.id;

  const offer =
    await db.offer.create({
      data: {
        title:
          `${stamp} OFFER`,
        titleEn:
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

  const now = new Date();

  const snapshot = {
    version: 1,
    purchasedAt:
      now.toISOString(),

    offer: {
      id: offerId,
      title:
        `${stamp} OFFER`,
      titleEn:
        `${stamp} OFFER`,
      type: "membership",
      discount: 0,
      description: null,
      descriptionEn: null,
      appliesTo: null,
      appliesToEn: null,

      expiresAtAtPurchase:
        new Date(
          now.getTime() +
            7 * 24 * 60 * 60 * 1000,
        ).toISOString(),

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
        now.toISOString(),
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

        paidAt: now,

        metadata:
          JSON.stringify({
            testMarker: stamp,
            offerBoxPurchase:
              true,
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

        holdExpiresAt: null,

        paymentTransactionId:
          paymentId,

        paidAt: now,
      },
    });

  purchaseId = purchase.id;
});

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getCurrentAppUser
    .mockResolvedValue({
      id: userId,
      name:
        `${stamp} USER`,
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

function redeemRequest() {
  return new Request(
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
  );
}

describe(
  "Offer Box redeem exact-once",
  () => {
    it(
      "converts reserved capacity exactly once and reuses the same membership on retry",
      async () => {
        const firstResponse =
          await redeemOfferBox(
            redeemRequest(),
          );

        const firstBody =
          await firstResponse.json();

        expect(
          firstResponse.status,
          JSON.stringify(firstBody),
        ).toBe(200);

        expect(firstBody.success)
          .toBe(true);

        expect(
          firstBody.alreadyRedeemed,
        ).toBe(false);

        expect(
          typeof firstBody.membership?.id,
        ).toBe("string");

        const activatedMembershipId =
          firstBody.membership.id as string;

        const firstPurchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        expect(
          firstPurchase.status,
        ).toBe("redeemed");

        expect(
          firstPurchase.redeemedUserMembershipId,
        ).toBe(
          activatedMembershipId,
        );

        expect(
          firstPurchase.redeemedAt,
        ).toBeInstanceOf(Date);

        const firstOffer =
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
          firstOffer.offerBoxReservedCount,
        ).toBe(0);

        expect(
          firstOffer.currentSubscribers,
        ).toBe(1);

        const firstMembershipCount =
          await db.userMembership.count({
            where: {
              userId,
            },
          });

        expect(
          firstMembershipCount,
        ).toBe(1);

        const userMembership =
          await db.userMembership
            .findUniqueOrThrow({
              where: {
                id:
                  activatedMembershipId,
              },
            });

        expect(
          userMembership.userId,
        ).toBe(userId);

        expect(
          userMembership.membershipId,
        ).toBe(membershipId);

        expect(
          userMembership.offerId,
        ).toBe(offerId);

        expect(
          userMembership.status,
        ).toBe("active");

        expect(
          userMembership.startDate,
        ).toBeInstanceOf(Date);

        expect(
          userMembership.endDate,
        ).toBeInstanceOf(Date);

        expect(
          userMembership.endDate.getTime(),
        ).toBeGreaterThan(
          userMembership.startDate.getTime(),
        );

        const paymentAfterFirst =
          await db.paymentTransaction
            .findUniqueOrThrow({
              where: {
                id: paymentId,
              },
            });

        expect(
          paymentAfterFirst.status,
        ).toBe("paid");

        expect(
          paymentAfterFirst.membershipId,
        ).toBe(
          activatedMembershipId,
        );

        expect(
          mocks.applyMembershipBookingPlanTx,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.applyMembershipSessionCarryoverTx,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.lockMembershipLifecycleUserTx,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.runPaidMembershipPostActivationReconciliation,
        ).toHaveBeenCalledTimes(1);

        /*
         * Exact same customer retry.
         */
        const secondResponse =
          await redeemOfferBox(
            redeemRequest(),
          );

        const secondBody =
          await secondResponse.json();

        expect(
          secondResponse.status,
          JSON.stringify(secondBody),
        ).toBe(200);

        expect(secondBody.success)
          .toBe(true);

        expect(
          secondBody.alreadyRedeemed,
        ).toBe(true);

        expect(
          secondBody.membership.id,
        ).toBe(
          activatedMembershipId,
        );

        const secondPurchase =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        expect(
          secondPurchase.status,
        ).toBe("redeemed");

        expect(
          secondPurchase.redeemedUserMembershipId,
        ).toBe(
          activatedMembershipId,
        );

        const secondOffer =
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
          secondOffer.offerBoxReservedCount,
        ).toBe(0);

        expect(
          secondOffer.currentSubscribers,
        ).toBe(1);

        const secondMembershipCount =
          await db.userMembership.count({
            where: {
              userId,
            },
          });

        expect(
          secondMembershipCount,
        ).toBe(1);

        /*
         * Retry must not repeat entitlement mutation.
         */
        expect(
          mocks.applyMembershipBookingPlanTx,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.applyMembershipSessionCarryoverTx,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.lockMembershipLifecycleUserTx,
        ).toHaveBeenCalledTimes(1);

        /*
         * Post-activation reconciliation is intentionally
         * idempotent and may self-heal on the retry.
         */
        expect(
          mocks.runPaidMembershipPostActivationReconciliation,
        ).toHaveBeenCalledTimes(2);

        console.log(
          "FIRST_REDEEM_STATUS=redeemed",
        );

        console.log(
          "SECOND_REDEEM_ALREADY_REDEEMED=YES",
        );

        console.log(
          "REDEEMED_MEMBERSHIP_REUSED=YES",
        );

        console.log(
          "OFFER_BOX_RESERVED_COUNT_AFTER_REDEEM=0",
        );

        console.log(
          "OFFER_CURRENT_SUBSCRIBERS_AFTER_REDEEM=1",
        );

        console.log(
          "USER_MEMBERSHIP_COUNT_AFTER_RETRY=1",
        );

        console.log(
          "ENTITLEMENT_MUTATION_EXACT_ONCE=PASS",
        );

        console.log(
          "EXTERNAL_PAYMENT_PROVIDER_CALLED=NO",
        );
      },
      20000,
    );
  },
);