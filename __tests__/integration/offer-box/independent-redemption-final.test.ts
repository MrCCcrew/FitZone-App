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
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  verify: vi.fn(),
  paidStatus: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.user,
}));

vi.mock("@/lib/payments/registry", () => ({
  getPaymentProvider: () => ({
    verifyTransaction: mocks.verify,
  }),
}));

vi.mock("@/lib/payments/service", () => ({
  updatePaymentTransactionStatus: mocks.paidStatus,
}));

import { POST as redeem } from "@/app/api/offer-box/redeem/route";
import { db as appDb } from "@/lib/db";

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error("R06D2C_DATABASE_URL_REQUIRED");
}

const url = new URL(rawUrl);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "3306" ||
  url.pathname !== "/fitzone_final_release_r13_test" ||
  decodeURIComponent(url.username) !== "fitzone_r13_user"
) {
  throw new Error("R06D2C_UNSAFE_DATABASE");
}

const prisma = new PrismaClient();

const stamp = `R06D2C-${randomUUID().slice(0, 12)}`;

const ids = {
  user: `${stamp}-user`,
  membership: `${stamp}-plan`,
  oldMembership: `${stamp}-old-membership`,
  trainer: `${stamp}-trainer`,
  gymClass: `${stamp}-class`,
  oldSchedule: `${stamp}-old-schedule`,
  newSchedule: `${stamp}-new-schedule`,
  oldBooking: `${stamp}-old-booking`,
  offer: `${stamp}-offer`,
  purchase: `${stamp}-purchase`,
  payment: `${stamp}-payment`,
  legacyPurchase: `${stamp}-legacy-purchase`,
  legacyPayment: `${stamp}-legacy-payment`,
};

const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);

const endDate = new Date(
  Date.now() + 30 * 24 * 60 * 60 * 1000,
);

function request(
  purchaseId = ids.purchase,
  scheduleIds = [ids.newSchedule],
  confirmed = true,
) {
  return new Request(
    "http://localhost/api/offer-box/redeem",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        purchaseId,
        scheduleIds,
        confirmed,
      }),
    },
  );
}

async function readResponse(response: Response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

function journalKey(referenceId: string) {
  return {
    referenceType_referenceId: {
      referenceType: "OfferBoxPurchase",
      referenceId,
    },
  };
}

async function fixtureSnapshot() {
  return {
    membership: await prisma.userMembership.findUniqueOrThrow({
      where: { id: ids.oldMembership },
    }),

    oldBooking: await prisma.booking.findUniqueOrThrow({
      where: { id: ids.oldBooking },
    }),

    oldSchedule: await prisma.schedule.findUniqueOrThrow({
      where: { id: ids.oldSchedule },
    }),
  };
}

beforeAll(async () => {
  const accounts = await prisma.gLAccount.count({
    where: {
      code: {
        in: ["1030", "4020", "2020", "5020", "2030"],
      },
    },
  });

  expect(accounts).toBe(5);

  await prisma.user.create({
    data: {
      id: ids.user,
      name: stamp,
      email: `${stamp.toLowerCase()}@test.local`,
      role: "customer",
      isActive: true,
    },
  });

  await prisma.membership.create({
    data: {
      id: ids.membership,
      name: stamp,
      price: 200,
      duration: 30,
      features: "[]",
      kind: "subscription",
      sessionsCount: 4,
      isActive: true,
    },
  });

  await prisma.userMembership.create({
    data: {
      id: ids.oldMembership,
      userId: ids.user,
      membershipId: ids.membership,
      startDate: new Date(),
      endDate,
      status: "active",
      totalSessions: 4,
      baseSessions: 4,
      paymentAmount: 200,
    },
  });

  await prisma.trainer.create({
    data: {
      id: ids.trainer,
      name: stamp,
      specialty: "fitness",
      bio: "Integration fixture",
      isActive: true,
    },
  });

  await prisma.class.create({
    data: {
      id: ids.gymClass,
      name: stamp,
      trainerId: ids.trainer,
      type: "fitness",
      duration: 60,
      intensity: "medium",
      maxSpots: 10,
      price: 100,
      isActive: true,
    },
  });

  await prisma.schedule.create({
    data: {
      id: ids.oldSchedule,
      classId: ids.gymClass,
      date: tomorrow,
      time: "09:00",
      availableSpots: 9,
      isActive: true,
    },
  });

  await prisma.schedule.create({
    data: {
      id: ids.newSchedule,
      classId: ids.gymClass,
      date: tomorrow,
      time: "12:00",
      availableSpots: 0,
      isActive: true,
    },
  });

  await prisma.booking.create({
    data: {
      id: ids.oldBooking,
      userId: ids.user,
      scheduleId: ids.oldSchedule,
      userMembershipId: ids.oldMembership,
      status: "confirmed",
      paymentMethod: "cash",
      paidAmount: 100,
      entitlementUnits: 1,
    },
  });

  await prisma.offer.create({
    data: {
      id: ids.offer,
      title: stamp,
      discount: 0,
      expiresAt: endDate,
      offerBoxEnabled: true,
      offerBoxReservedCount: 1,
      currentSubscribers: 0,
      maxSubscribers: 5,
      isActive: true,
    },
  });

  const now = new Date();

  const snapshot = {
    version: 1,
    purchasedAt: now.toISOString(),

    offer: {
      id: ids.offer,
      title: stamp,
      titleEn: stamp,
      type: "membership",
      discount: 0,
      description: null,
      descriptionEn: null,
      appliesTo: null,
      appliesToEn: null,
      expiresAtAtPurchase: endDate.toISOString(),
      membershipId: ids.membership,
      sessionsCount: 1,
      durationDays: 7,
      priceBefore: 100,
      specialPrice: 100,
      features: [],
      featuresEn: [],
    },

    membershipTemplate: {
      sourceMembershipId: ids.membership,
      name: stamp,
      nameEn: stamp,
      kind: "subscription",
      durationDays: 7,
      sessionsCount: 1,
      walletBonus: 25,
      productRewards: null,
    },

    commercial: {
      currency: "EGP",
      originalPrice: 100,
      finalPrice: 100,
    },

    economics: {
      commissionSnapshot: JSON.stringify({
        testMarker: stamp,
      }),
      attributionMode: "direct_offer_box",
    },

    eligibilitySnapshot: {
      mode: "class_ids",
      classIds: [ids.gymClass],
      classTypes: [],
    },

    ageEligibility: {
      requiresBirthDate: false,
      minAgeYears: null,
      maxAgeYears: null,
      ageYearsAtPurchase: null,
      validatedAt: now.toISOString(),
    },
  };

  await prisma.paymentTransaction.create({
    data: {
      id: ids.payment,
      userId: ids.user,
      offerId: ids.offer,
      purpose: "offer_box",
      provider: "paymob",
      amount: 100,
      currency: "EGP",
      status: "paid",
      paymentMethod: "paymob",
      paidAt: now,

      providerReference: `${stamp}-intention`,
      externalReference: `${stamp}-transaction`,

      metadata: JSON.stringify({
        offerBoxPurchaseId: ids.purchase,
      }),
    },
  });

  await prisma.offerBoxPurchase.create({
    data: {
      id: ids.purchase,
      userId: ids.user,
      offerId: ids.offer,
      status: "available",
      offerSnapshot: JSON.stringify(snapshot),
      snapshotVersion: 1,
      priceSnapshot: 100,
      currency: "EGP",
      paymentMethod: "paymob",
      paymentTransactionId: ids.payment,
      paidAt: now,
    },
  });

  mocks.user.mockResolvedValue({
    id: ids.user,
    name: stamp,
  });

  mocks.verify.mockResolvedValue({
    status: "paid",
  });

  /*
   * Central payment status processing is already covered by
   * the R06B provider-authority and commission tests.
   *
   * This test isolates the new redemption transaction.
   */
  mocks.paidStatus.mockResolvedValue({
    id: ids.payment,
    status: "paid",
  });
});

afterAll(async () => {
  /*
   * Delete ONLY this test's isolated fixtures.
   * Never use unscoped deleteMany.
   */
  try {
    const walletTransactions =
      await prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: ids.user },
        },
        select: { id: true },
      });

    await prisma.journal.deleteMany({
      where: {
        OR: [
          {
            referenceType: "OfferBoxPurchase",
            referenceId: {
              in: [ids.purchase, ids.legacyPurchase],
            },
          },
          {
            referenceType: "WalletTransaction",
            referenceId: {
              in: walletTransactions.map((row) => row.id),
            },
          },
        ],
      },
    });

    await prisma.booking.deleteMany({
      where: { userId: ids.user },
    });

    await prisma.offerBoxEntitlement.deleteMany({
      where: { userId: ids.user },
    });

    await prisma.offerBoxPurchase.deleteMany({
      where: {
        id: {
          in: [ids.purchase, ids.legacyPurchase],
        },
        userId: ids.user,
      },
    });

    await prisma.paymentTransaction.deleteMany({
      where: {
        id: {
          in: [ids.payment, ids.legacyPayment],
        },
        userId: ids.user,
      },
    });

    await prisma.userMembership.deleteMany({
      where: { userId: ids.user },
    });

    await prisma.schedule.deleteMany({
      where: {
        id: {
          in: [ids.oldSchedule, ids.newSchedule],
        },
      },
    });

    await prisma.class.deleteMany({
      where: { id: ids.gymClass },
    });

    await prisma.trainer.deleteMany({
      where: { id: ids.trainer },
    });

    await prisma.offer.deleteMany({
      where: { id: ids.offer },
    });

    await prisma.membership.deleteMany({
      where: { id: ids.membership },
    });

    await prisma.notification.deleteMany({
      where: { userId: ids.user },
    });

    await prisma.walletTransaction.deleteMany({
      where: { wallet: { userId: ids.user } },
    });

    await prisma.wallet.deleteMany({
      where: { userId: ids.user },
    });

    await prisma.user.deleteMany({
      where: { id: ids.user },
    });
  } finally {
    await prisma.$disconnect();
    await appDb.$disconnect();
  }
});

describe("R06D2C independent redemption real MySQL", () => {
  it("rejects unconfirmed and unverified activation before creating rights", async () => {
    const noConfirmation = await readResponse(
      await redeem(request(ids.purchase, [ids.newSchedule], false)),
    );

    expect(noConfirmation.status).toBe(400);

    mocks.verify.mockResolvedValueOnce({
      status: "pending",
    });

    const unverified = await readResponse(
      await redeem(request()),
    );

    expect(unverified.status).toBe(409);

    expect(
      await prisma.offerBoxEntitlement.count({
        where: { purchaseId: ids.purchase },
      }),
    ).toBe(0);

    expect(
      await prisma.journal.findUnique({
        where: journalKey(ids.purchase),
      }),
    ).toBeNull();
  });

  it("rolls back a full schedule, then activates independently and replays exactly once", async () => {
    const oldRights = await fixtureSnapshot();

    const full = await readResponse(
      await redeem(request()),
    );

    expect(full.status, JSON.stringify(full.body))
      .not.toBe(200);

    expect(
      await prisma.offerBoxEntitlement.count({
        where: { purchaseId: ids.purchase },
      }),
    ).toBe(0);

    expect(
      await prisma.journal.findUnique({
        where: journalKey(ids.purchase),
      }),
    ).toBeNull();

    expect(
      await prisma.offerBoxPurchase.findUniqueOrThrow({
        where: { id: ids.purchase },
      }),
    ).toEqual(expect.objectContaining({
      status: "available",
      redeemedUserMembershipId: null,
    }));

    expect(await fixtureSnapshot()).toEqual(oldRights);

    await prisma.schedule.update({
      where: { id: ids.newSchedule },
      data: { availableSpots: 10 },
    });

    const first = await readResponse(
      await redeem(request()),
    );

    expect(first.status, JSON.stringify(first.body))
      .toBe(200);

    expect(first.body).toEqual(
      expect.objectContaining({
        success: true,
        alreadyRedeemed: false,
        redemptionType: "independent",
        membership: null,
        carryover: null,
      }),
    );

    const entitlement =
      await prisma.offerBoxEntitlement.findUniqueOrThrow({
        where: { purchaseId: ids.purchase },
      });

    expect(entitlement.id)
      .toBe(first.body.entitlement.id);

    expect(entitlement.totalSessions).toBe(1);
    expect(entitlement.status).toBe("active");

    const bookings = await prisma.booking.findMany({
      where: {
        offerBoxEntitlementId: entitlement.id,
      },
    });

    expect(bookings).toHaveLength(1);

    expect(bookings[0]).toEqual(
      expect.objectContaining({
        userId: ids.user,
        scheduleId: ids.newSchedule,
        userMembershipId: null,
        offerBoxEntitlementId: entitlement.id,
        status: "confirmed",
        paidAmount: 0,
        paymentMethod: "offer_box",
      }),
    );

    expect(
      await prisma.schedule.findUniqueOrThrow({
        where: { id: ids.newSchedule },
      }),
    ).toEqual(expect.objectContaining({
      availableSpots: 9,
    }));

    expect(await fixtureSnapshot()).toEqual(oldRights);

    expect(
      await prisma.userMembership.count({
        where: { userId: ids.user },
      }),
    ).toBe(1);

    const payment =
      await prisma.paymentTransaction.findUniqueOrThrow({
        where: { id: ids.payment },
      });

    expect(payment.membershipId).toBeNull();
    expect(payment.status).toBe("paid");

    const metadata = JSON.parse(payment.metadata!);

    expect(
      metadata.offerBoxActivationReconciliation,
    ).toEqual(expect.objectContaining({
      completed: true,
      purchaseId: ids.purchase,
      entitlementId: entitlement.id,
    }));

    const journal = await prisma.journal.findUniqueOrThrow({
      where: journalKey(ids.purchase),
      include: {
        entries: {
          include: { account: true },
        },
      },
    });

    expect(journal.entries).toHaveLength(2);

    expect(
      journal.entries.map((row) => ({
        code: row.account.code,
        debit: Number(row.debit),
        credit: Number(row.credit),
      })),
    ).toEqual(expect.arrayContaining([
      { code: "1030", debit: 100, credit: 0 },
      { code: "4020", debit: 0, credit: 100 },
    ]));

    expect(
      await prisma.wallet.findUniqueOrThrow({
        where: { userId: ids.user },
      }),
    ).toEqual(expect.objectContaining({
      balance: 25,
    }));

    const offer =
      await prisma.offer.findUniqueOrThrow({
        where: { id: ids.offer },
      });

    expect(offer.offerBoxReservedCount).toBe(0);
    expect(offer.currentSubscribers).toBe(1);

    const verifyCalls = mocks.verify.mock.calls.length;

    const replay = await readResponse(
      await redeem(request()),
    );

    expect(replay.status).toBe(200);
    expect(replay.body.alreadyRedeemed).toBe(true);

    expect(replay.body.entitlement.id)
      .toBe(entitlement.id);

    expect(mocks.verify.mock.calls.length)
      .toBe(verifyCalls);

    expect(
      await prisma.offerBoxEntitlement.count({
        where: { purchaseId: ids.purchase },
      }),
    ).toBe(1);

    expect(
      await prisma.booking.count({
        where: {
          offerBoxEntitlementId: entitlement.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.journal.count({
        where: {
          referenceType: "OfferBoxPurchase",
          referenceId: ids.purchase,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.walletTransaction.count({
        where: {
          wallet: { userId: ids.user },
          source: "offer_box_bonus",
        },
      }),
    ).toBe(1);

    expect(
      await prisma.wallet.findUniqueOrThrow({
        where: { userId: ids.user },
      }),
    ).toEqual(expect.objectContaining({
      balance: 25,
    }));

    expect(
      await prisma.offer.findUniqueOrThrow({
        where: { id: ids.offer },
      }),
    ).toEqual(expect.objectContaining({
      offerBoxReservedCount: 0,
      currentSubscribers: 1,
    }));

    expect(await fixtureSnapshot()).toEqual(oldRights);

    console.log("REAL_INDEPENDENT_BOOKING=PASS");
    console.log("REAL_GL_AND_WALLET_SETTLEMENT=PASS");
    console.log("FULL_SCHEDULE_ROLLBACK=PASS");
    console.log("OLD_MEMBERSHIP_AND_BOOKING_UNCHANGED=PASS");
    console.log("REDEMPTION_REPLAY_EXACT_ONCE=PASS");
  }, 60000);

  it("keeps an already-redeemed historical purchase on its original membership", async () => {
    const original =
      await prisma.offerBoxPurchase.findUniqueOrThrow({
        where: { id: ids.purchase },
      });

    await prisma.paymentTransaction.create({
      data: {
        id: ids.legacyPayment,
        userId: ids.user,
        purpose: "offer_box",
        provider: "paymob",
        status: "paid",
        amount: 100,
        currency: "EGP",
        membershipId: ids.oldMembership,
        paidAt: new Date(),
      },
    });

    await prisma.offerBoxPurchase.create({
      data: {
        id: ids.legacyPurchase,
        userId: ids.user,
        offerId: ids.offer,
        status: "redeemed",
        offerSnapshot: original.offerSnapshot,
        snapshotVersion: 1,
        priceSnapshot: 100,
        currency: "EGP",
        paymentTransactionId: ids.legacyPayment,
        paidAt: new Date(),
        redeemedAt: new Date(),
        redeemedUserMembershipId: ids.oldMembership,
      },
    });

    const preimage = await fixtureSnapshot();

    const replay = await readResponse(
      await redeem(request(ids.legacyPurchase, [], false)),
    );

    expect(replay.status).toBe(200);

    expect(replay.body).toEqual(
      expect.objectContaining({
        alreadyRedeemed: true,
        redemptionType: "legacy_membership",
        entitlement: null,
        membership: expect.objectContaining({
          id: ids.oldMembership,
        }),
      }),
    );

    expect(
      await prisma.offerBoxEntitlement.count({
        where: { purchaseId: ids.legacyPurchase },
      }),
    ).toBe(0);

    expect(
      await prisma.journal.findUnique({
        where: journalKey(ids.legacyPurchase),
      }),
    ).toBeNull();

    expect(await fixtureSnapshot()).toEqual(preimage);

    console.log("LEGACY_REDEEMED_MEMBERSHIP_REPLAY=PASS");
  });
});