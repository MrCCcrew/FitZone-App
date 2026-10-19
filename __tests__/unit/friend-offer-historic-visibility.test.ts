import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.currentUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    friendOfferParticipant: {
      findMany: mocks.findMany,
    },
  },
}));

import { GET } from "@/app/api/me/friend-offers/route";

function participation(options: {
  status: string;
  groupStatus?: string;
  paidMember?: boolean;
  expired?: boolean;
  paymentStatus?: string | null;
}) {
  const paid = options.paidMember ?? false;

  return {
    id: "participant-current",
    userId: "customer-current",
    role: "member",
    status: options.status,
    shareAmountMinor: 19500,
    paidAt: options.status === "paid" ? new Date() : null,
    joinedAt: new Date(),
    paymentTransaction: options.paymentStatus
      ? {
          id: "payment-current",
          status: options.paymentStatus,
          amount: 195,
          checkoutUrl: null,
        }
      : null,
    userMembership: null,
    group: {
      id: "friend-group",
      inviteToken: "test-only-token",
      status: options.groupStatus ?? "waiting",
      matchingEnabled: false,
      expiresAt: new Date(
        Date.now() + (options.expired === false ? 3600000 : -3600000),
      ),
      offerTermsSnapshot: null,
      participants: [
        { id: "existing-paid", status: paid ? "paid" : "joined" },
        { id: "participant-current", status: options.status },
      ],
      config: {
        requiredMembers: 3,
        offer: {
          id: "offer-test",
          title: "Friends Offer",
          titleEn: null,
          requiresBirthDate: false,
          requiresEgyptianNationalId: false,
          minAgeYears: null,
          maxAgeYears: null,
        },
      },
    },
  };
}

async function readOffers() {
  const response = await GET();

  expect(response.status).toBe(200);

  return (await response.json()) as {
    offers: Array<{
      participantStatus: string;
      financialReviewRequired: boolean;
      group: {
        remainingPlaces: number;
        status: string;
      };
      payment: { status: string } | null;
    }>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue({ id: "customer-current" });
});

describe("Historic Friends Offer account financial visibility", () => {
  it("keeps an unpaid friend visible after invite expiry when someone paid", async () => {
    mocks.findMany.mockResolvedValue([
      participation({
        status: "joined",
        paidMember: true,
        expired: true,
      }),
    ]);

    const result = await readOffers();

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      participantStatus: "joined",
      financialReviewRequired: false,
      group: {
        remainingPlaces: 1,
        status: "waiting",
      },
    });
  });

  it("preserves the already-paid member without false financial review", async () => {
    mocks.findMany.mockResolvedValue([
      participation({
        status: "paid",
        paidMember: true,
        expired: true,
        paymentStatus: "paid",
      }),
    ]);

    const result = await readOffers();

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].participantStatus).toBe("paid");
    expect(result.offers[0].financialReviewRequired).toBe(false);
    expect(result.offers[0].payment?.status).toBe("paid");
  });

  it("does not revive expired unpaid groups without settled shares", async () => {
    mocks.findMany.mockResolvedValue([
      participation({
        status: "joined",
        paidMember: false,
        expired: true,
      }),
    ]);

    const result = await readOffers();

    expect(result.offers).toHaveLength(0);
  });

  it("keeps cancelled paid groups in financial review", async () => {
    mocks.findMany.mockResolvedValue([
      participation({
        status: "paid",
        groupStatus: "cancelled",
        paidMember: true,
        paymentStatus: "paid",
      }),
    ]);

    const result = await readOffers();

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].financialReviewRequired).toBe(true);
    expect(result.offers[0].group.status).toBe("cancelled");
  });

  it("preserves reconciliation for an unresolved expired checkout", async () => {
    mocks.findMany.mockResolvedValue([
      participation({
        status: "checkout_started",
        paidMember: false,
        paymentStatus: "pending",
      }),
    ]);

    const result = await readOffers();

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].financialReviewRequired).toBe(true);
  });

  it("does not hide checkout claims requiring reconciliation", async () => {
    mocks.findMany.mockResolvedValue([
      participation({
        status: "checkout_claiming",
        paidMember: false,
      }),
    ]);

    const result = await readOffers();

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].financialReviewRequired).toBe(true);
  });
});
