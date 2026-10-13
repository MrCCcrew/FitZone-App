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
vi.mock("@/lib/payments/service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/payments/service")>(),
  createPaymentTransaction: mocks.createPaymentTransaction,
}));

const db = new PrismaClient();
const marker = `TEST-STUDENT-DIRECT-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userId = "";
let offerId = "";
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
}
beforeAll(async () => {
  const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
  expect(actual[0]?.name).toBe("fitzone_test");
  const user = await db.user.create({
    data: {
      name: marker,
      email: `${marker.toLowerCase()}@test.local`,
      emailVerified: new Date(),
      birthDate: new Date("2000-01-01T00:00:00.000Z"), // deliberately eligible account DOB
      role: "member",
      isActive: true,
    },
  });
  userId = user.id;
  const offer = await db.offer.create({
    data: {
      title: marker,
      type: "special",
      discount: 0,
      specialPrice: 90,
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
    if (offerId) await db.offer.deleteMany({ where: { id: offerId } });
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
});
