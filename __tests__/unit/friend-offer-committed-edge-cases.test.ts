import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  getEligibility: vi.fn(),

  configFindUnique: vi.fn(),
  groupFindFirst: vi.fn(),
  groupFindUnique: vi.fn(),

  transaction: vi.fn(),

  txGroupFindUnique: vi.fn(),
  txGroupUpdate: vi.fn(),
  txGroupUpdateMany: vi.fn(),
  txParticipantCreate: vi.fn(),
  txParticipantUpdate: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/get-eligible-classes", () => ({
  getEligibilityPolicySnapshotForSource: mocks.getEligibility,
}));

vi.mock("@/lib/db", () => ({
  db: {
    friendOfferConfig: {
      findUnique: mocks.configFindUnique,
    },
    friendOfferGroup: {
      findFirst: mocks.groupFindFirst,
      findUnique: mocks.groupFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/friend-offers/route";

function loadedGroup(participants: Array<{
  id?: string;
  userId: string;
  role: string;
  status: string;
  userMembershipId?: string | null;
  shareAmountMinor: number;
}>) {
  return {
    id: "group-1",
    inviteToken: "COMMITTEDTOKEN",
    status: participants.length >= 2 ? "ready" : "waiting",
    expiresAt: new Date(Date.now() - 60_000),
    priceSnapshotMinor: 56000,
    offerTermsSnapshot: JSON.stringify({
      offerId: "offer-1",
      membershipId: "membership-1",
      title: "عرض الصحاب",
      titleEn: "Friends Offer",
      specialPrice: 560,
      sessionsCount: 12,
      durationDays: 30,
      requiredMembers: 2,
    }),
    eligibilitySnapshot: null,
    matchingEnabled: false,
    config: {
      id: "config-1",
      requiredMembers: 2,
      isActive: false,
      offer: {
        id: "offer-1",
        membershipId: "membership-1",
        title: "عرض الصحاب",
        titleEn: "Friends Offer",
        specialPrice: 560,
        sessionsCount: 12,
        durationDays: 30,
        expiresAt: new Date(Date.now() - 60_000),
        isActive: false,
      },
    },
    participants: participants.map((p) => ({
      id: p.id ?? `participant-${p.userId}`,
      userId: p.userId,
      role: p.role,
      status: p.status,
      userMembershipId: p.userMembershipId ?? null,
      shareAmountMinor: p.shareAmountMinor,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getEligibility.mockResolvedValue({});

  mocks.txGroupUpdate.mockResolvedValue({});
  mocks.txGroupUpdateMany.mockResolvedValue({ count: 0 });
  mocks.txParticipantCreate.mockResolvedValue({});
  mocks.txParticipantUpdate.mockResolvedValue({});

  mocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        friendOfferGroup: {
          findUnique: mocks.txGroupFindUnique,
          update: mocks.txGroupUpdate,
          updateMany: mocks.txGroupUpdateMany,
        },
        friendOfferParticipant: {
          create: mocks.txParticipantCreate,
          update: mocks.txParticipantUpdate,
        },
      }),
  );
});

describe("Friend Offer committed edge cases", () => {
  it("reuses creator committed group even after invite/offer expiry and disable", async () => {
    mocks.getCurrentAppUser.mockResolvedValue({
      id: "creator-1",
    });

    mocks.configFindUnique.mockResolvedValue({
      id: "config-1",
      offerId: "offer-1",
      requiredMembers: 2,
      inviteExpiryHours: 24,
      isActive: false,
      offer: {
        id: "offer-1",
        membershipId: "membership-1",
        title: "عرض الصحاب",
        titleEn: "Friends Offer",
        type: "special",
        discount: null,
        description: null,
        descriptionEn: null,
        expiresAt: new Date(Date.now() - 60_000),
        isActive: false,
        specialPrice: 560,
        sessionsCount: 12,
        durationDays: 30,
        priceBefore: 700,
        features: null,
        featuresEn: null,
      },
    });

    mocks.groupFindFirst.mockResolvedValue({
      id: "group-1",
      inviteToken: "COMMITTEDTOKEN",
    });

    mocks.groupFindUnique.mockResolvedValue(
      loadedGroup([
        {
          userId: "creator-1",
          role: "creator",
          status: "paid",
          shareAmountMinor: 28000,
        },
      ]),
    );

    const response = await POST(
      new Request("http://localhost/api/friend-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          offerId: "offer-1",
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.reused).toBe(true);
    expect(body.group.id).toBe("group-1");
    expect(body.group.token).toBe("COMMITTEDTOKEN");

    expect(mocks.groupFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          configId: "config-1",
          creatorUserId: "creator-1",
          participants: {
            some: {
              status: {
                in: ["paid", "activated"],
              },
            },
          },
        }),
      }),
    );

    expect(mocks.getEligibility).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows a new partner to join a committed group after invite/offer expiry and disable", async () => {
    mocks.getCurrentAppUser.mockResolvedValue({
      id: "partner-2",
    });

    mocks.txGroupFindUnique.mockResolvedValue({
      id: "group-1",
      inviteToken: "COMMITTEDTOKEN",
      status: "waiting",
      expiresAt: new Date(Date.now() - 60_000),
      priceSnapshotMinor: 56000,
      config: {
        id: "config-1",
        requiredMembers: 2,
        isActive: false,
        offer: {
          id: "offer-1",
          isActive: false,
          expiresAt: new Date(Date.now() - 60_000),
        },
      },
      participants: [
        {
          id: "participant-creator",
          userId: "creator-1",
          status: "paid",
        },
      ],
    });

    mocks.groupFindUnique.mockResolvedValue(
      loadedGroup([
        {
          id: "participant-creator",
          userId: "creator-1",
          role: "creator",
          status: "paid",
          shareAmountMinor: 28000,
        },
        {
          id: "participant-partner",
          userId: "partner-2",
          role: "invited",
          status: "joined",
          shareAmountMinor: 28000,
        },
      ]),
    );

    const response = await POST(
      new Request("http://localhost/api/friend-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          token: "COMMITTEDTOKEN",
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.alreadyJoined).toBe(false);
    expect(body.group.id).toBe("group-1");
    expect(body.group.joinedCount).toBe(2);
    expect(body.group.remainingPlaces).toBe(0);

    expect(mocks.txParticipantCreate).toHaveBeenCalledWith({
      data: {
        groupId: "group-1",
        userId: "partner-2",
        role: "invited",
        status: "joined",
        shareAmountMinor: 28000,
      },
    });

    expect(mocks.txGroupUpdate).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { status: "ready" },
    });

    expect(mocks.txGroupUpdateMany).not.toHaveBeenCalled();
  });
});
