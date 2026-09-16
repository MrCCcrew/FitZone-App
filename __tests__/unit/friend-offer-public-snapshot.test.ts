import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  groupFindUnique: vi.fn(),
  groupUpdateMany: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    friendOfferGroup: {
      findUnique: mocks.groupFindUnique,
      updateMany: mocks.groupUpdateMany,
    },
  },
}));

import { GET } from "@/app/api/friend-offers/route";

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getCurrentAppUser.mockResolvedValue({
    id: "user-1",
  });

  mocks.groupUpdateMany.mockResolvedValue({
    count: 0,
  });

  mocks.groupFindUnique.mockResolvedValue({
    id: "group-1",
    inviteToken: "FRIENDTOKEN",
    status: "waiting",
    expiresAt: new Date(Date.now() + 60_000),

    priceSnapshotMinor: 56000,

    offerTermsSnapshot: JSON.stringify({
      offerId: "offer-1",
      membershipId: "membership-1",
      title: "عرض الصحاب المجمد",
      titleEn: "Frozen Friend Offer",
      specialPrice: 560,
      sessionsCount: 12,
      durationDays: 30,
      requiredMembers: 2,
    }),

    config: {
      requiredMembers: 2,
      offer: {
        id: "offer-1",
        membershipId: "membership-1",

        // Intentionally changed live values.
        title: "عرض معدل من الأدمن",
        titleEn: "Admin Changed Offer",
        specialPrice: 999,
        sessionsCount: 99,
        durationDays: 90,

        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    },

    participants: [
      {
        userId: "user-1",
        role: "creator",
        status: "joined",
        userMembershipId: null,
      },
    ],
  });
});

describe("Friend Offer public frozen purchase terms", () => {
  it("returns frozen price, duration and sessions instead of mutable live offer values", async () => {
    const response = await GET(
      new Request("http://localhost/api/friend-offers?token=FRIENDTOKEN"),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.offer.title).toBe("عرض الصحاب المجمد");
    expect(body.offer.titleEn).toBe("Frozen Friend Offer");

    expect(body.offer.specialPrice).toBe(560);
    expect(body.offer.sessionsCount).toBe(12);
    expect(body.offer.durationDays).toBe(30);

    expect(body.offer.specialPrice).not.toBe(999);
    expect(body.offer.sessionsCount).not.toBe(99);
    expect(body.offer.durationDays).not.toBe(90);

    expect(body.requiredMembers).toBe(2);
    expect(body.joinedCount).toBe(1);
    expect(body.remainingPlaces).toBe(1);
  });
});
