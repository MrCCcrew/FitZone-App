import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    friendOfferParticipant: {
      findMany: mocks.findMany,
    },
  },
}));

import { GET } from "@/app/api/me/friend-offers/route";

function participation(
  id: string,
  status: string,
  groupStatus: string,
  expired: boolean,
  paymentStatus: string | null,
) {
  return {
    id,
    role: "creator",
    status,
    shareAmountMinor: 23500,
    paidAt: status === "paid" ? new Date() : null,
    userMembership: null,
    paymentTransaction: paymentStatus
      ? {
          id: "pay-" + id,
          status: paymentStatus,
          amount: 235,
          checkoutUrl: null,
        }
      : null,
    group: {
      id: "group-" + id,
      inviteToken: "AbCdEfGhIjKlMnOpQrStUvWx",
      status: groupStatus,
      expiresAt: new Date(
        Date.now() + (expired ? -3600000 : 3600000),
      ),
      matchingEnabled: false,
      offerTermsSnapshot: null,
      participants: [{ id, status }],
      config: {
        requiredMembers: 3,
        offer: {
          id: "offer",
          title: "عرض الصحاب",
          titleEn: "Friends Offer",
          requiresBirthDate: false,
          requiresEgyptianNationalId: false,
          minAgeYears: null,
          maxAgeYears: null,
        },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentAppUser.mockResolvedValue({ id: "test-user" });
});

describe("Account friend offer financial truth", () => {
  it("distinguishes recoverable expired paid groups from closed paid groups", async () => {
    mocks.findMany.mockResolvedValue([
      participation("one", "paid", "waiting", true, "paid"),
      participation("two", "paid", "expired", true, "paid"),
      participation("three", "paid", "cancelled", true, "paid"),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.offers).toHaveLength(3);
    const financialStates = body.offers.map(
      (item: {
        participantId: string;
        financialReviewRequired: boolean;
      }) => ({
        id: item.participantId,
        review: item.financialReviewRequired,
      }),
    );

    // An expired invitation remains recoverable if the group
    // is still waiting and a member has already paid.
    expect(financialStates).toEqual([
      { id: "one", review: false },
      { id: "two", review: true },
      { id: "three", review: true },
    ]);

    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where.group).toBeUndefined();
  });

  it("keeps ambiguous attempts but hides expired unpaid invitations", async () => {
    mocks.findMany.mockResolvedValue([
      participation("pending", "checkout_started", "waiting", true, "pending"),
      participation("unpaid", "joined", "waiting", true, null),
    ]);

    const body = await (await GET()).json();

    expect(body.offers).toHaveLength(1);
    expect(body.offers[0].participantId).toBe("pending");
    expect(body.offers[0].financialReviewRequired).toBe(true);
    expect(body.offers[0].payment.status).toBe("pending");
  });

  it("preserves active invitations and paid completion awaiting activation", async () => {
    mocks.findMany.mockResolvedValue([
      participation("live", "joined", "waiting", false, null),
      participation("complete", "paid", "completed", false, "paid"),
    ]);

    const body = await (await GET()).json();

    expect(body.offers).toHaveLength(2);
    expect(
      body.offers.every(
        (item: { financialReviewRequired: boolean }) =>
          !item.financialReviewRequired,
      ),
    ).toBe(true);
  });

  it("account UI explains financial review and blocks duplicate checkout", () => {
    const source = readFileSync(
      "src/app/account/AccountClient.tsx",
      "utf8",
    );

    expect(source).toContain(
      "friendOffer.financialReviewRequired ? (",
    );
    expect(source).toContain(
      "!friendOffer.financialReviewRequired ? (",
    );
    expect(source).toContain(
      "الحالة تحتاج مراجعة مالية.",
    );
    expect(source).toContain(
      "void startFriendCheckout(friendOffer)",
    );
  });
});
