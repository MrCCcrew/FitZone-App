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

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    role: "admin",
    session: {
      user: {
        id: "R07B2C3-admin-fixture",
        role: "admin",
      },
    },
  })),
}));

import { GET as getAccounting } from "@/app/api/admin/accounting/route";
import { GET as getCustomerStatement } from "@/app/api/admin/accounting/customers-report/route";
import { GET as getReceipt } from "@/app/api/offer-box/purchases/[purchaseId]/receipt/route";


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

const stamp = `R07B2C3-${randomUUID().slice(0, 12)}`;

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
      role: "member",
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



async function loadFinancialReports() {
  const accountingResponse = await getAccounting(
    new Request("http://localhost/api/admin/accounting"),
  );

  if (!accountingResponse) {
    throw new Error("ACCOUNTING_RESPONSE_MISSING");
  }

  expect(accountingResponse.status).toBe(200);

  const accounting = await accountingResponse.json();

  const statementUrl =
    "http://localhost/api/admin/accounting/customers-report" +
    "?search=" +
    encodeURIComponent(stamp) +
    "&page=1&limit=30";

  const statementResponse = await getCustomerStatement(
    new Request(statementUrl),
  );

  if (!statementResponse) {
    throw new Error("CUSTOMER_STATEMENT_RESPONSE_MISSING");
  }

  expect(statementResponse.status).toBe(200);

  const statement = await statementResponse.json();

  const customer = statement.rows.find(
    (row: { id: string }) => row.id === ids.user,
  );

  expect(customer).toBeTruthy();

  const collectionRows =
    accounting.club.offerBoxCollections.filter(
      (row: { id: string }) => row.id === ids.purchase,
    );

  const revenueRows =
    accounting.club.offerBoxRevenueRows.filter(
      (row: { id: string }) => row.id === ids.purchase,
    );

  const statementRows = customer.offerBoxPurchases.filter(
    (row: { id: string }) => row.id === ids.purchase,
  );

  return {
    customer,
    collectionRows,
    revenueRows,
    statementRows,
  };
}

async function loadReceipt() {
  const response = await getReceipt(
    new Request(
      `http://localhost/api/offer-box/purchases/${ids.purchase}/receipt`,
    ),
    {
      params: Promise.resolve({
        purchaseId: ids.purchase,
      }),
    },
  );

  expect(response.status).toBe(200);

  const html = await response.text();

  expect(html).toContain("100.00");
  expect(html).toContain(`OB-${ids.purchase}`);
  expect(html).toContain(stamp);

  return html;
}

describe("R07B2C3 independent offer financial reports", () => {
  it("reports collection before redemption, recognizes activation once and preserves receipt and customer totals", async () => {
    // This fixture already contains an old membership
    // and a historical booking. They are preserved.

    const oldRights = await fixtureSnapshot();

    const before = await loadFinancialReports();

    expect(before.collectionRows).toHaveLength(1);
    expect(before.collectionRows[0].confirmedPaidAmount)
      .toBe(100);

    expect(before.statementRows).toHaveLength(1);

    expect(before.statementRows[0].confirmedPaidAmount)
      .toBe(100);

    expect(before.customer.totalOfferBoxPaid).toBe(100);

    expect(before.customer.totalPaid).toBe(
      before.customer.totalMembershipPaid +
      before.customer.totalBookingPaid +
      100,
    );

    expect(before.revenueRows).toHaveLength(0);

    expect(
      await prisma.journal.findUnique({
        where: journalKey(ids.purchase),
      }),
    ).toBeNull();

    const receiptBefore = await loadReceipt();

    console.log("OFFER_COLLECTION_BEFORE_ACTIVATION=100");
    console.log("OFFER_REVENUE_BEFORE_ACTIVATION=0");
    console.log("CUSTOMER_STATEMENT_BEFORE_ACTIVATION=PASS");
    console.log("REAL_DB_RECEIPT_BEFORE_ACTIVATION=PASS");

    // Make the fixture's target class available
    // and execute the real redemption route.

    await prisma.schedule.update({
      where: { id: ids.newSchedule },
      data: { availableSpots: 10 },
    });

    const first = await readResponse(
      await redeem(request()),
    );

    expect(first.status, JSON.stringify(first.body)).toBe(200);

    expect(first.body.redemptionType).toBe("independent");
    expect(first.body.membership).toBeNull();

    const after = await loadFinancialReports();

    expect(after.collectionRows).toHaveLength(1);

    expect(after.collectionRows[0].confirmedPaidAmount)
      .toBe(100);

    expect(after.revenueRows).toHaveLength(1);
    expect(after.revenueRows[0].revenue).toBe(100);

    expect(after.statementRows).toHaveLength(1);

    expect(after.customer.totalOfferBoxPaid).toBe(100);
    expect(after.customer.totalPaid).toBe(
      before.customer.totalPaid,
    );

    expect(after.customer.totalMembershipPaid).toBe(
      before.customer.totalMembershipPaid,
    );

    expect(after.customer.totalBookingPaid).toBe(
      before.customer.totalBookingPaid,
    );

    expect(await fixtureSnapshot()).toEqual(oldRights);

    expect(
      await prisma.userMembership.count({
        where: { userId: ids.user },
      }),
    ).toBe(1);

    const journal = await prisma.journal.findUniqueOrThrow({
      where: journalKey(ids.purchase),
      include: {
        entries: {
          include: {
            account: true,
          },
        },
      },
    });

    expect(journal.status).toBe("posted");
    expect(journal.entries).toHaveLength(2);

    const clearing = journal.entries.find(
      (entry) => entry.account.code === "1030",
    );

    const revenue = journal.entries.find(
      (entry) => entry.account.code === "4020",
    );

    expect(Number(clearing?.debit)).toBe(100);
    expect(Number(clearing?.credit)).toBe(0);
    expect(Number(revenue?.credit)).toBe(100);
    expect(Number(revenue?.debit)).toBe(0);

    expect(after.revenueRows[0].journalId).toBe(
      journal.id,
    );

    const receiptAfter = await loadReceipt();

    expect(receiptAfter).toBe(receiptBefore);

    console.log("OFFER_COLLECTION_AFTER_ACTIVATION=100");
    console.log("OFFER_REVENUE_AFTER_ACTIVATION=100");
    console.log("CUSTOMER_TOTAL_NOT_DUPLICATED=PASS");
    console.log("POSTED_JOURNAL_BALANCED=PASS");
    console.log("REAL_DB_RECEIPT_STABLE=PASS");
    console.log("OLD_MEMBERSHIP_AND_BOOKING_PRESERVED=PASS");

    // Replay the exact same activation.
    // No second financial movement is allowed.

    const replay = await readResponse(
      await redeem(request()),
    );

    expect(replay.status, JSON.stringify(replay.body))
      .toBe(200);

    expect(replay.body.alreadyRedeemed).toBe(true);

    const final = await loadFinancialReports();

    expect(final.collectionRows).toHaveLength(1);
    expect(final.revenueRows).toHaveLength(1);
    expect(final.statementRows).toHaveLength(1);

    expect(final.customer.totalOfferBoxPaid).toBe(100);
    expect(final.customer.totalPaid).toBe(
      before.customer.totalPaid,
    );

    expect(final.revenueRows[0].journalId).toBe(
      journal.id,
    );

    expect(
      await prisma.journal.count({
        where: {
          referenceType: "OfferBoxPurchase",
          referenceId: ids.purchase,
        },
      }),
    ).toBe(1);

    // A different authenticated customer cannot
    // retrieve this receipt from the real database.

    mocks.user.mockResolvedValueOnce({
      id: `${stamp}-different-customer`,
    });

    const forbidden = await getReceipt(
      new Request(
        `http://localhost/api/offer-box/purchases/${ids.purchase}/receipt`,
      ),
      {
        params: Promise.resolve({
          purchaseId: ids.purchase,
        }),
      },
    );

    expect(forbidden.status).toBe(404);

    console.log("FINANCIAL_REPLAY_EXACT_ONCE=PASS");
    console.log("REAL_DB_OTHER_CUSTOMER_RECEIPT_BLOCKED=PASS");
    console.log("R07B2C3_REAL_FINANCIAL_ACCEPTANCE=PASS");
  });
});