import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) throw Error("REFUSING: isolated DATABASE_URL missing");
const url = new URL(raw);
if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "3306" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) throw Error("REFUSING: fitzone_test isolation required");

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  cleanupExpiredPendingMembershipsForUser: vi.fn(),
  findScheduleReplaceablePendingMembershipCheckoutTx: vi.fn(),
  maybeRenewPendingMembershipCheckout: vi.fn(),
  createPaymentTransaction: vi.fn(),
}));
vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));
vi.mock("@/lib/payments/pending-membership-cleanup", () => ({
  cleanupExpiredPendingMembershipsForUser: mocks.cleanupExpiredPendingMembershipsForUser,
  findScheduleReplaceablePendingMembershipCheckoutTx: mocks.findScheduleReplaceablePendingMembershipCheckoutTx,
}));
vi.mock("@/lib/payments/membership-paymob-renewal-handoff", () => ({
  maybeRenewPendingMembershipCheckout: mocks.maybeRenewPendingMembershipCheckout,
}));
vi.mock("@/lib/membership-lifecycle-lock", () => ({
  lockMembershipLifecycleUserTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/reward-settings", () => ({
  getRewardSettings: vi.fn().mockResolvedValue({
    pointValueEGP: 1,
    pointsPerSubscription: 0,
  }),
  calcTier: vi.fn(),
}));
vi.mock("@/lib/analytics/checkout-events", () => ({
  recordCheckoutStarted: vi.fn(),
}));
vi.mock("@/lib/payments/service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/payments/service")>(),
  createPaymentTransaction: mocks.createPaymentTransaction,
}));

const db = new PrismaClient();
const marker = `TEST-STUDENT-DIRECT-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userId = "";
let offerId = "";
let membershipId = "";
let subscribe: (req: Request) => Promise<Response>;

function syntheticId(date: string): string {
  const [year, month, day] = date.split("-");
  return (Number(year) < 2000 ? "2" : "3") +
    year.slice(2) + month + day + "01" + "12345";
}
async function attempt(egyptianNationalId?: string) {
  const response = await subscribe(new Request("http://localhost/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      offerId,
      membershipId: null,
      scheduleIds: [],
      paymentMethod: "paymob",
      ...(egyptianNationalId === undefined ? {} : { egyptianNationalId }),
    }),
  }));
  return { status: response.status, body: await response.json() };
}
async function assertNoFinancialOrBookingEffects() {
  expect(await db.userMembership.count({ where: { userId } })).toBe(0);
  expect(await db.booking.count({ where: { userId } })).toBe(0);
  expect(await db.paymentTransaction.count({ where: { userId } })).toBe(0);
  expect((await db.offer.findUniqueOrThrow({
    where: { id: offerId },
    select: { currentSubscribers: true, offerBoxReservedCount: true },
  }))).toMatchObject({ currentSubscribers: 0, offerBoxReservedCount: 0 });
  expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  // STUDENT_PRE_PAYMENT_BOUNDARY_REGRESSION
  expect(mocks.cleanupExpiredPendingMembershipsForUser).not.toHaveBeenCalled();
  expect(mocks.findScheduleReplaceablePendingMembershipCheckoutTx).not.toHaveBeenCalled();
  expect(mocks.maybeRenewPendingMembershipCheckout).not.toHaveBeenCalled();
}
beforeAll(async () => {
  const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
  expect(actual[0]?.name).toBe("fitzone_test");
  const user = await db.user.create({
    data: {
      name: marker,
      email: `${marker.toLowerCase()}@test.local`,
      emailVerified: new Date(),
      birthDate: new Date("2008-01-01T00:00:00.000Z"), // account DOB is eligible (18 years); ID decides
      role: "member",
      isActive: true,
    },
  });
  userId = user.id;
  const membership = await db.membership.create({
    data: {
      name: `${marker}-MEMBERSHIP`,
      price: 100,
      priceAfter: 100,
      duration: 30,
      features: "[]",
      isActive: true,
      kind: "subscription",
    },
  });
  membershipId = membership.id;

  const offer = await db.offer.create({
    data: {
      title: marker,
      type: "special",
      discount: 0,
      specialPrice: 90,
      membershipId: membership.id,
      expiresAt: new Date("2027-12-31T23:59:59.000Z"),
      isActive: true,
      requiresBirthDate: true,
      requiresEgyptianNationalId: true,
      minAgeYears: 13,
      maxAgeYears: 25,
      currentSubscribers: 0,
      maxSubscribers: 10,
      offerBoxEnabled: false,
    },
  });
  offerId = offer.id;
  const route = await import("@/app/api/subscribe/route");
  subscribe = route.POST;
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentAppUser.mockResolvedValue({ id: userId });
  mocks.cleanupExpiredPendingMembershipsForUser.mockResolvedValue(undefined);
  mocks.findScheduleReplaceablePendingMembershipCheckoutTx.mockResolvedValue(null);
  mocks.maybeRenewPendingMembershipCheckout.mockResolvedValue({ kind: "none" });
  mocks.createPaymentTransaction.mockImplementation(() => {
    throw Error("FORBIDDEN_EXTERNAL_PAYMENT_FOR_REJECTED_NATIONAL_ID");
  });
});
afterAll(async () => {
  try {
    if (userId) {
      await db.paymentTransaction.deleteMany({ where: { userId } });
      await db.notification.deleteMany({ where: { userId } });
      await db.booking.deleteMany({ where: { userId } });
      await db.userMembership.deleteMany({ where: { userId } });
    }
    if (offerId) await db.offer.deleteMany({ where: { id: offerId } });
    if (membershipId) await db.membership.deleteMany({ where: { id: membershipId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  } finally {
    await db.$disconnect();
  }
});

describe("direct /api/subscribe student Egyptian-ID security integration", () => {
  it("requires ID despite a valid account birth date and produces no side effects", async () => {
    const result = await attempt();
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("EGYPTIAN_NATIONAL_ID_REQUIRED");
    await assertNoFinancialOrBookingEffects();
  });
  it("rejects malformed national ID without payment or membership writes", async () => {
    const result = await attempt("12345678901234");
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("EGYPTIAN_NATIONAL_ID_INVALID");
    await assertNoFinancialOrBookingEffects();
  });
  it("rejects a structurally valid but underage national ID despite eligible account DOB", async () => {
    const result = await attempt(syntheticId("2020-10-10"));
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AGE_NOT_ELIGIBLE");
    await assertNoFinancialOrBookingEffects();
  });
  it("rejects an overage national ID regardless of account DOB", async () => {
    const result = await attempt(syntheticId("1990-10-10"));
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AGE_NOT_ELIGIBLE");
    await assertNoFinancialOrBookingEffects();
  });
  it("keeps ambiguous previous Paymob payment blocked without starting another payment", async () => {
    mocks.maybeRenewPendingMembershipCheckout.mockResolvedValueOnce({
      kind: "blocked",
    });

    const result = await attempt(syntheticId("2008-10-10"));

    expect(result.status).toBe(409);
    expect(result.body.error).toContain("محاولة الدفع السابقة");
    expect(mocks.cleanupExpiredPendingMembershipsForUser).toHaveBeenCalledOnce();
    expect(mocks.maybeRenewPendingMembershipCheckout).toHaveBeenCalledOnce();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();

    expect(await db.userMembership.count({ where: { userId } })).toBe(0);
    expect(await db.paymentTransaction.count({ where: { userId } })).toBe(0);
    expect(await db.booking.count({ where: { userId } })).toBe(0);
  });

  it("returns the existing mocked Paymob renewal without creating a duplicate", async () => {
    const existing = {
      kind: "resumed",
      membershipId: "existing-pending-membership",
      transactionId: "existing-payment-transaction",
      checkoutUrl: "https://checkout.example.test/existing",
      endDate: new Date("2026-11-01T00:00:00.000Z"),
    };

    mocks.maybeRenewPendingMembershipCheckout.mockResolvedValueOnce(existing);

    const result = await attempt(syntheticId("2008-10-10"));

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.resumedPending).toBe(true);
    expect(result.body.transactionId).toBe(existing.transactionId);
    expect(result.body.subscriptionId).toBe(existing.membershipId);
    expect(result.body.checkoutUrl).toBe(existing.checkoutUrl);
    expect(mocks.maybeRenewPendingMembershipCheckout).toHaveBeenCalledOnce();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();

    expect(await db.userMembership.count({ where: { userId } })).toBe(0);
    expect(await db.paymentTransaction.count({ where: { userId } })).toBe(0);
    expect(await db.booking.count({ where: { userId } })).toBe(0);
  });

  it("accepts an eligible ID, locks 90 EGP pending checkout, without persisting the ID", async () => {
    const nationalId = syntheticId("2008-10-10"); // synthetic data ONLY
    mocks.createPaymentTransaction.mockImplementationOnce(async (input: {
      userId: string;
      amount: number;
      membershipId?: string | null;
      provider?: string | null;
      purpose: string;
      businessUnit?: string;
      metadata?: unknown;
    }) => {
      expect(input.amount).toBe(90);
      expect(input.userId).toBe(userId);
      expect(input.provider).toBe("paymob");
      expect(input.purpose).toBe("membership");
      expect(input.businessUnit).toBe("club");
      expect(input.metadata ? JSON.stringify(input.metadata) : "").not.toContain(nationalId);
      const t = await db.paymentTransaction.create({
        data: {
          userId: input.userId,
          membershipId: input.membershipId ?? null,
          amount: input.amount,
          provider: "paymob",
          purpose: "membership",
          businessUnit: "club",
          paymentMethod: "offer",
          status: "pending",
          currency: "EGP",
          metadata: JSON.stringify(input.metadata ?? {}),
        },
      });
      return { id: t.id, checkoutUrl: "https://checkout.example.test/mock" };
    });

    const result = await attempt(nationalId);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.success).toBe(true);
    expect(typeof result.body.subscriptionId).toBe("string");
    expect(typeof result.body.transactionId).toBe("string");
    expect(result.body.checkoutUrl).toBe("https://checkout.example.test/mock");
    expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);

    const held = await db.userMembership.findUniqueOrThrow({
      where: { id: result.body.subscriptionId },
    });
    expect(held).toMatchObject({
      userId, membershipId, offerId,
      status: "pending_payment",
      paymentAmount: 90,
      snapshotFinalPrice: 90,
      activatedAt: null,
    });
    expect(held.pendingExpiresAt).not.toBeNull();
    const holdMinutes = ((held.pendingExpiresAt?.getTime() ?? 0) - Date.now()) / 60000;
    expect(holdMinutes).toBeGreaterThan(58);
    expect(holdMinutes).toBeLessThanOrEqual(60);

    const frozen = JSON.parse(held.offerSnapshot ?? "{}");
    expect(frozen.ageEligibility).toMatchObject({
      verificationMethod: "egyptian_national_id",
      ageYearsAtPurchase: 18,
    });
    expect(held.offerSnapshot).not.toContain(nationalId);
    const tx = await db.paymentTransaction.findUniqueOrThrow({
      where: { id: result.body.transactionId },
    });
    expect(tx.amount).toBe(90);
    expect(tx.status).toBe("pending");
    expect(tx.metadata).not.toContain(nationalId);
    expect(await db.booking.count({ where: { userId } })).toBe(0);
    expect(await db.userMembership.count({ where: { userId, status: "active" } })).toBe(0);
    expect((await db.offer.findUniqueOrThrow({ where: { id: offerId } })).currentSubscribers).toBe(0);
  }, 20000);
});
