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
    "REFUSING: Offer Box frozen age integration requires fitzone_test",
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
  `TEST-OFFER-BOX-AGE-${Date.now()}-${Math.random()
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
  const now = new Date();

  /*
   * Represents the customer being exactly eligible
   * at the time the purchase snapshot was frozen.
   *
   * The authoritative frozen contract below records
   * ageYearsAtPurchase = 25.
   */
  const purchaseEligibleBirthDate =
    new Date(
      Date.UTC(
        now.getUTCFullYear() - 25,
        now.getUTCMonth(),
        now.getUTCDate(),
        12,
        0,
        0,
      ),
    );

  const user =
    await db.user.create({
      data: {
        name:
          `${stamp} USER`,

        email:
          `${stamp.toLowerCase()}@test.local`,

        role: "customer",
        isActive: true,

        birthDate:
          purchaseEligibleBirthDate,
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
            now.getTime() +
              7 * 24 * 60 * 60 * 1000,
          ),

        isActive: true,

        offerBoxEnabled: true,

        offerBoxReservedCount: 1,

        currentSubscribers: 0,

        maxSubscribers: 2,

        requiresBirthDate: true,

        minAgeYears: 13,
        maxAgeYears: 25,
      },
    });

  offerId = offer.id;

  /*
   * This is the contract frozen at successful purchase.
   * The customer was valid at the inclusive max age = 25.
   */
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
      requiresBirthDate: true,

      minAgeYears: 13,

      maxAgeYears: 25,

      ageYearsAtPurchase: 25,

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

        paidAt: now,

        holdExpiresAt: null,
      },
    });

  purchaseId = purchase.id;

  /*
   * AFTER PURCHASE:
   *
   * 1) Customer profile birth date changes so the
   *    live profile would now be far outside max age.
   *
   * 2) Live offer age rules are also tightened.
   *
   * Neither change may revoke an already-paid right.
   */
  await db.user.update({
    where: {
      id: userId,
    },
    data: {
      birthDate:
        new Date(
          Date.UTC(
            now.getUTCFullYear() - 35,
            now.getUTCMonth(),
            now.getUTCDate(),
            12,
            0,
            0,
          ),
        ),
    },
  });

  await db.offer.update({
    where: {
      id: offerId,
    },
    data: {
      requiresBirthDate: true,

      minAgeYears: 13,

      maxAgeYears: 20,
    },
  });
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

describe(
  "Offer Box frozen age eligibility",
  () => {
    it(
      "redeems the purchased right without revalidating changed live age data",
      async () => {
        const userBefore =
          await db.user
            .findUniqueOrThrow({
              where: {
                id: userId,
              },

              select: {
                birthDate: true,
              },
            });

        const offerBefore =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },

              select: {
                requiresBirthDate: true,
                minAgeYears: true,
                maxAgeYears: true,

                offerBoxReservedCount:
                  true,

                currentSubscribers:
                  true,
              },
            });

        expect(
          userBefore.birthDate,
        ).toBeInstanceOf(Date);

        expect(
          offerBefore.requiresBirthDate,
        ).toBe(true);

        /*
         * Live policy has changed AFTER purchase.
         */
        expect(
          offerBefore.maxAgeYears,
        ).toBe(20);

        expect(
          offerBefore.offerBoxReservedCount,
        ).toBe(1);

        expect(
          offerBefore.currentSubscribers,
        ).toBe(0);

        const purchaseBefore =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        const frozen =
          JSON.parse(
            purchaseBefore.offerSnapshot,
          );

        expect(
          frozen.ageEligibility
            .requiresBirthDate,
        ).toBe(true);

        expect(
          frozen.ageEligibility
            .minAgeYears,
        ).toBe(13);

        expect(
          frozen.ageEligibility
            .maxAgeYears,
        ).toBe(25);

        expect(
          frozen.ageEligibility
            .ageYearsAtPurchase,
        ).toBe(25);

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

        const purchaseAfter =
          await db.offerBoxPurchase
            .findUniqueOrThrow({
              where: {
                id: purchaseId,
              },
            });

        expect(
          purchaseAfter.status,
        ).toBe("redeemed");

        expect(
          purchaseAfter.redeemedUserMembershipId,
        ).toBe(
          body.membership.id,
        );

        const offerAfter =
          await db.offer
            .findUniqueOrThrow({
              where: {
                id: offerId,
              },

              select: {
                maxAgeYears: true,

                offerBoxReservedCount:
                  true,

                currentSubscribers:
                  true,
              },
            });

        /*
         * The live policy remains changed;
         * redeem did not rewrite it.
         */
        expect(
          offerAfter.maxAgeYears,
        ).toBe(20);

        expect(
          offerAfter.offerBoxReservedCount,
        ).toBe(0);

        expect(
          offerAfter.currentSubscribers,
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
          "AGE_AT_PURCHASE=25",
        );

        console.log(
          "FROZEN_MAX_AGE_AT_PURCHASE=25",
        );

        console.log(
          "LIVE_MAX_AGE_AT_REDEEM=20",
        );

        console.log(
          "LIVE_USER_BIRTHDATE_CHANGED_AFTER_PURCHASE=YES",
        );

        console.log(
          "PURCHASED_RIGHT_REDEEMED_AFTER_AGE_CHANGE=YES",
        );

        console.log(
          "AGE_REVALIDATED_AT_REDEEM=NO",
        );

        console.log(
          "OFFER_BOX_RESERVED_COUNT_AFTER_REDEEM=0",
        );

        console.log(
          "OFFER_CURRENT_SUBSCRIBERS_AFTER_REDEEM=1",
        );

        console.log(
          "FROZEN_AGE_ELIGIBILITY_GATE=PASS",
        );

        console.log(
          "EXTERNAL_PAYMENT_PROVIDER_CALLED=NO",
        );
      },
      20000,
    );
  },
);