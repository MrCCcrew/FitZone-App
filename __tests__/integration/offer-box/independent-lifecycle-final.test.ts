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
import { POST as book } from "@/app/api/bookings/route";
import { GET as purchases } from "@/app/api/offer-box/purchases/route";
import {
  createBookingRescheduleRequest,
  reviewBookingRescheduleRequest,
  applyIndependentOfferAdminBookingAction,
} from "@/lib/booking-reschedule-service";
import {
  ensureMembershipAttendancePass,
  ensureOfferBoxAttendancePass,
} from "@/lib/attendance";
import { markClassAttendance } from "@/lib/attendance-service";
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

const stamp = `R06D4B-${randomUUID().slice(0, 12)}`;

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
      sessionsCount: 3,
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
      sessionsCount: 3,
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

    await prisma.attendanceCheckIn.deleteMany({
      where: { userId: ids.user },
    });

    await prisma.attendancePass.deleteMany({
      where: { userId: ids.user },
    });

    await prisma.bookingRescheduleRequest.deleteMany({
      where: {
        booking: { userId: ids.user },
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
      where: { classId: ids.gymClass },
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


function bookingRequest(
  entitlementId: string,
  scheduleId: string,
) {
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      offerBoxEntitlementId: entitlementId,
      scheduleId,
    }),
  });
}

async function capacity(scheduleId: string) {
  return (await prisma.schedule.findUniqueOrThrow({
    where: { id: scheduleId },
  })).availableSpots;
}

async function lifecycleFinancialSnapshot() {
  return {
    oldRights: await fixtureSnapshot(),

    memberships: await prisma.userMembership.findMany({
      where: { userId: ids.user },
      orderBy: { id: "asc" },
    }),

    payment: await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: ids.payment },
    }),

    purchase: await prisma.offerBoxPurchase.findUniqueOrThrow({
      where: { id: ids.purchase },
    }),

    wallet: await prisma.wallet.findUnique({
      where: { userId: ids.user },
    }),

    walletTransactions: await prisma.walletTransaction.findMany({
      where: { wallet: { userId: ids.user } },
      orderBy: { id: "asc" },
    }),

    journal: await prisma.journal.findUniqueOrThrow({
      where: journalKey(ids.purchase),
      include: {
        entries: { orderBy: { id: "asc" } },
      },
    }),

    commissions: await prisma.staffCommission.findMany({
      where: { offerBoxPurchaseId: ids.purchase },
      orderBy: { id: "asc" },
    }),
  };
}

describe("R06D4B real independent offer lifecycle", () => {
  it("preserves membership and finance while booking, moving, compensating and attending", async () => {
    const oldRights = await fixtureSnapshot();

    await prisma.schedule.update({
      where: { id: ids.newSchedule },
      data: { availableSpots: 10 },
    });

    // Establish a genuinely redeemed, paid fixture using
    // the already-tested production redemption path.

    const activationSeedA = await prisma.schedule.create({
      data: {
        id: `${stamp}-activation-seed-a`,
        classId: ids.gymClass,
        date: new Date(tomorrow.getTime() + 86400000),
        time: "12:00",
        availableSpots: 10,
        isActive: true,
      },
    });

    const activationSeedB = await prisma.schedule.create({
      data: {
        id: `${stamp}-activation-seed-b`,
        classId: ids.gymClass,
        date: new Date(tomorrow.getTime() + 2 * 86400000),
        time: "12:00",
        availableSpots: 10,
        isActive: true,
      },
    });

    const activated = await readResponse(
      await redeem(request(
        ids.purchase,
        [
          ids.newSchedule,
          activationSeedA.id,
          activationSeedB.id,
        ],
        true,
      )),
    );

    expect(
      activated.status,
      JSON.stringify(activated.body),
    ).toBe(200);

    const entitlement =
      await prisma.offerBoxEntitlement.findUniqueOrThrow({
        where: { purchaseId: ids.purchase },
      });

    expect(entitlement.totalSessions).toBe(3);
    expect(await fixtureSnapshot()).toEqual(oldRights);

    const activationBookings = await prisma.booking.findMany({
      where: {
        userId: ids.user,
        offerBoxEntitlementId: entitlement.id,
        userMembershipId: null,
        status: "confirmed",
      },
    });

    expect(activationBookings).toHaveLength(3);

    // Test-only preparation of two released rights.
    // Production booking policy remains unchanged.
    await prisma.$transaction(async (tx) => {
      for (const seed of [activationSeedA, activationSeedB]) {
        const booking = activationBookings.find(
          (row) => row.scheduleId === seed.id,
        );

        expect(booking).toBeDefined();

        const cancelled = await tx.booking.updateMany({
          where: {
            id: booking!.id,
            userId: ids.user,
            offerBoxEntitlementId: entitlement.id,
            userMembershipId: null,
            status: "confirmed",
          },
          data: { status: "cancelled" },
        });

        expect(cancelled.count).toBe(1);

        await tx.schedule.update({
          where: { id: seed.id },
          data: {
            availableSpots: { increment: 1 },
          },
        });
      }
    });

    expect(
      await prisma.booking.count({
        where: {
          offerBoxEntitlementId: entitlement.id,
          status: "confirmed",
        },
      }),
    ).toBe(1);

    expect(await capacity(activationSeedA.id)).toBe(10);
    expect(await capacity(activationSeedB.id)).toBe(10);

    console.log("ACTIVATION_FIXTURE_THREE_SESSIONS=PASS");
    console.log("TWO_TEST_RESERVATIONS_RELEASED=PASS");

    const oldPass = await ensureMembershipAttendancePass(
      ids.oldMembership,
    );

    expect(oldPass?.userMembershipId).toBe(ids.oldMembership);
    expect(oldPass?.offerBoxEntitlementId).toBeNull();

    // Capture the actual persisted row, without included relations.
    const oldPassBefore = await prisma.attendancePass.findUniqueOrThrow({
      where: { id: oldPass!.id },
    });

    const financialBefore = await lifecycleFinancialSnapshot();

    const first = await prisma.booking.findFirstOrThrow({
      where: {
        offerBoxEntitlementId: entitlement.id,
        scheduleId: ids.newSchedule,
      },
    });

    const createSlot = async (
      suffix: string,
      days: number,
      time: string,
      availableSpots = 10,
    ) => prisma.schedule.create({
      data: {
        id: `${stamp}-${suffix}`,
        classId: ids.gymClass,
        date: new Date(Date.now() + days * 86400000),
        time,
        availableSpots,
        isActive: true,
      },
    });

    const additional = await createSlot("additional", 3, "10:00");
    const moveTarget = await createSlot("move", 4, "11:00");
    const makeupTarget = await createSlot("makeup", 5, "12:00");
    const third = await createSlot("third", 6, "13:00");
    const overflow = await createSlot("overflow", 6, "14:00");
    const directTarget = await createSlot("direct", 5, "15:00");
    const fullTarget = await createSlot("full", 5, "16:00", 0);

    // A. Actual additional booking API.

    const added = await readResponse(
      await book(bookingRequest(entitlement.id, additional.id)),
    );

    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(await capacity(additional.id)).toBe(9);

    const secondBooking = await prisma.booking.findFirstOrThrow({
      where: {
        offerBoxEntitlementId: entitlement.id,
        scheduleId: additional.id,
      },
    });

    expect(secondBooking.userMembershipId).toBeNull();
    expect(secondBooking.paidAmount).toBe(0);

    const duplicate = await readResponse(
      await book(bookingRequest(entitlement.id, additional.id)),
    );

    expect(duplicate.status).not.toBe(200);
    expect(await capacity(additional.id)).toBe(9);

    console.log("ADDITIONAL_BOOKING_AND_DUPLICATE_GUARD=PASS");

    // B. Customer request + real administrator approval.

    const change = await createBookingRescheduleRequest({
      userId: ids.user,
      bookingId: secondBooking.id,
      targetScheduleId: moveTarget.id,
      requestType: "upcoming_change",
    });

    expect(await capacity(moveTarget.id)).toBe(10);
    expect(await capacity(additional.id)).toBe(9);

    await reviewBookingRescheduleRequest({
      requestId: change.requestId,
      decision: "approve",
      reviewedByUserId: ids.user,
    });

    expect(await capacity(moveTarget.id)).toBe(9);
    expect(await capacity(additional.id)).toBe(10);

    const moved = await prisma.booking.findUniqueOrThrow({
      where: { id: secondBooking.id },
    });

    expect(moved.scheduleId).toBe(moveTarget.id);
    expect(moved.offerBoxEntitlementId).toBe(entitlement.id);
    expect(moved.userMembershipId).toBeNull();

    await expect(
      reviewBookingRescheduleRequest({
        requestId: change.requestId,
        decision: "approve",
        reviewedByUserId: ids.user,
      }),
    ).rejects.toThrow();

    console.log("RESCHEDULE_APPROVAL_AND_REPLAY=PASS");

    // C. Represent a historical absence using fixture time.
    // We do not wait for the scheduled day to pass.

    const historical = new Date(Date.now() - 86400000);

    await prisma.offerBoxEntitlement.update({
      where: { id: entitlement.id },
      data: { startDate: historical },
    });

    await prisma.schedule.update({
      where: { id: ids.newSchedule },
      data: {
        date: historical,
        time: "01:00",
      },
    });

    const absence = await createBookingRescheduleRequest({
      userId: ids.user,
      bookingId: first.id,
      targetScheduleId: makeupTarget.id,
      requestType: "past_absence_makeup",
      absenceReason: "Integration test historical absence",
    });

    const approved = await reviewBookingRescheduleRequest({
      requestId: absence.requestId,
      decision: "approve",
      reviewedByUserId: ids.user,
    });

    expect(approved.decision).toBe("approved");

    if (approved.decision !== "approved" || !approved.makeupBookingId) {
      throw new Error("MAKEUP_BOOKING_NOT_CREATED");
    }

    const makeup = await prisma.booking.findUniqueOrThrow({
      where: { id: approved.makeupBookingId },
    });

    expect(makeup.isMakeup).toBe(true);
    expect(makeup.offerBoxEntitlementId).toBe(entitlement.id);
    expect(makeup.userMembershipId).toBeNull();
    expect(makeup.paidAmount).toBe(0);
    expect(await capacity(makeupTarget.id)).toBe(9);

    expect(
      (await prisma.booking.findUniqueOrThrow({
        where: { id: first.id },
      })).status,
    ).toBe("noshow");

    // Historical seat is never returned to a past class.

    expect(await capacity(ids.newSchedule)).toBe(9);

    await expect(
      createBookingRescheduleRequest({
        userId: ids.user,
        bookingId: first.id,
        targetScheduleId: third.id,
        requestType: "past_absence_makeup",
        absenceReason: "Duplicate makeup attempt",
      }),
    ).rejects.toThrow();

    console.log("MAKEUP_OWNER_AND_EXACT_ONCE=PASS");

    // D. The compensated absence must not block the
    // third and final contractual unit.

    const last = await readResponse(
      await book(bookingRequest(entitlement.id, third.id)),
    );

    expect(last.status, JSON.stringify(last.body)).toBe(200);

    const lastBooking = await prisma.booking.findFirstOrThrow({
      where: {
        offerBoxEntitlementId: entitlement.id,
        scheduleId: third.id,
      },
    });

    const excess = await readResponse(
      await book(bookingRequest(entitlement.id, overflow.id)),
    );

    expect(excess.status).not.toBe(200);
    expect(await capacity(overflow.id)).toBe(10);

    const account = await readResponse(
      await purchases(new Request(
        "http://localhost/api/offer-box/purchases?page=0",
      )),
    );

    expect(account.status).toBe(200);

    const accountOffer = account.body.items.find(
      (item: any) => item.purchaseId === ids.purchase,
    );

    expect(accountOffer.entitlement).toEqual(
      expect.objectContaining({
        reservedUnits: 3,
        attendedUnits: 0,
        missedUnits: 1,
        compensatedMissedUnits: 1,
        allocatedUnits: 3,
        unallocatedUnits: 0,
      }),
    );

    console.log("COMPENSATED_NOSHOW_COUNTER_AND_QUOTA=PASS");

    // E. Real admin direct move, including full target.
    // No modification is allowed on failed capacity claim.

    await expect(
      applyIndependentOfferAdminBookingAction({
        bookingId: lastBooking.id,
        action: "reschedule",
        targetScheduleId: fullTarget.id,
        reviewedByUserId: ids.user,
      }),
    ).rejects.toThrow();

    expect(await capacity(fullTarget.id)).toBe(0);
    expect(await capacity(third.id)).toBe(9);

    await applyIndependentOfferAdminBookingAction({
      bookingId: lastBooking.id,
      action: "reschedule",
      targetScheduleId: directTarget.id,
      reviewedByUserId: ids.user,
    });

    expect(await capacity(third.id)).toBe(10);
    expect(await capacity(directTarget.id)).toBe(9);

    // Seed a cancelled booking using the sandbox fixture.
    // The real reactivation service is then tested.

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: lastBooking.id },
        data: { status: "cancelled" },
      }),
      prisma.schedule.update({
        where: { id: directTarget.id },
        data: { availableSpots: { increment: 1 } },
      }),
    ]);

    const restored = await applyIndependentOfferAdminBookingAction({
      bookingId: lastBooking.id,
      action: "confirm",
      reviewedByUserId: ids.user,
    });

    expect(restored.success).toBe(true);
    expect(await capacity(directTarget.id)).toBe(9);

    await applyIndependentOfferAdminBookingAction({
      bookingId: lastBooking.id,
      action: "confirm",
      reviewedByUserId: ids.user,
    });

    expect(await capacity(directTarget.id)).toBe(9);

    console.log("ADMIN_MOVE_FULL_TARGET_AND_RESTORE=PASS");

    // F. Attendance: correct ownership, future guard,
    // wrong QR rejection and concurrent duplicate scans.

    const offerPass = await ensureOfferBoxAttendancePass(
      entitlement.id,
      ids.user,
    );

    expect(offerPass?.offerBoxEntitlementId).toBe(entitlement.id);
    expect(offerPass?.userMembershipId).toBeNull();
    expect(offerPass?.id).not.toBe(oldPass?.id);

    const future = await markClassAttendance({
      bookingId: makeup.id,
      scannedByUserId: ids.user,
      source: "manual",
    });

    expect(future).toEqual({
      ok: false,
      code: "FUTURE_SESSION",
    });

    await prisma.schedule.update({
      where: { id: makeupTarget.id },
      data: {
        date: historical,
        time: "02:00",
      },
    });

    const wrongQr = await markClassAttendance({
      bookingId: makeup.id,
      scannedByUserId: ids.user,
      source: "qr",
      scannedPassId: oldPass!.id,
    });

    expect(wrongQr.ok).toBe(false);

    const scans = await Promise.all([
      markClassAttendance({
        bookingId: makeup.id,
        scannedByUserId: ids.user,
        source: "manual",
      }),
      markClassAttendance({
        bookingId: makeup.id,
        scannedByUserId: ids.user,
        source: "qr",
        scannedPassId: offerPass!.id,
      }),
    ]);

    expect(
      scans.filter(
        (row) => row.ok && row.status === "checked_in",
      ),
    ).toHaveLength(1);

    expect(
      await prisma.attendanceCheckIn.count({
        where: { bookingId: makeup.id },
      }),
    ).toBe(1);

    const checkIn = await prisma.attendanceCheckIn.findUniqueOrThrow({
      where: { bookingId: makeup.id },
    });

    expect(checkIn.passId).toBe(offerPass!.id);
    expect(checkIn.userMembershipId).toBeNull();
    expect(checkIn.scheduleId).toBe(makeupTarget.id);

    await prisma.schedule.update({
      where: { id: moveTarget.id },
      data: {
        date: historical,
        time: "03:00",
      },
    });

    const qr = await markClassAttendance({
      bookingId: secondBooking.id,
      scannedByUserId: ids.user,
      source: "qr",
      scannedPassId: offerPass!.id,
    });

    expect(qr).toEqual(
      expect.objectContaining({
        ok: true,
        status: "checked_in",
        membershipExpired: false,
        sessionsUsed: 2,
        sessionsRemaining: 1,
      }),
    );

    expect(
      await prisma.attendanceCheckIn.count({
        where: { passId: offerPass!.id },
      }),
    ).toBe(2);

    console.log("INDEPENDENT_MANUAL_QR_AND_CONCURRENT_SCAN=PASS");

    // G. The full independent lifecycle must not
    // mutate the original subscription or money.

    expect(await lifecycleFinancialSnapshot()).toEqual(
      financialBefore,
    );

    expect(
      await prisma.attendancePass.findUniqueOrThrow({
        where: { id: oldPass!.id },
      }),
    ).toEqual(oldPassBefore);

    const finalAccount = await readResponse(
      await purchases(new Request(
        "http://localhost/api/offer-box/purchases?page=0",
      )),
    );

    const finalOffer = finalAccount.body.items.find(
      (item: any) => item.purchaseId === ids.purchase,
    );

    expect(finalOffer.entitlement).toEqual(
      expect.objectContaining({
        reservedUnits: 1,
        attendedUnits: 2,
        missedUnits: 1,
        compensatedMissedUnits: 1,
        allocatedUnits: 3,
        unallocatedUnits: 0,
      }),
    );

    console.log("FINAL_ENTITLEMENT_COUNTERS=PASS");
    console.log("OLD_MEMBERSHIP_AND_ATTENDANCE_PASS=PASS");
    console.log("FINANCIAL_STATE_UNCHANGED=PASS");
    console.log("REAL_INDEPENDENT_LIFECYCLE=PASS");
  }, 60000);
});
