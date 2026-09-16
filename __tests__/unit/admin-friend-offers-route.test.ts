import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  offerFindMany: vi.fn(),
  offerFindUnique: vi.fn(),
  offerCreate: vi.fn(),
  offerUpdate: vi.fn(),
  classFindMany: vi.fn(),
  clearPublicApiCache: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.requireAdminFeature,
}));

vi.mock("@/lib/db", () => ({
  db: {
    offer: {
      findMany: mocks.offerFindMany,
      findUnique: mocks.offerFindUnique,
      create: mocks.offerCreate,
      update: mocks.offerUpdate,
    },
    class: {
      findMany: mocks.classFindMany,
    },
  },
}));

vi.mock("@/lib/public-cache", () => ({
  clearPublicApiCache: mocks.clearPublicApiCache,
}));

vi.mock("@/lib/audit-context", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/admin-linked-cleanup", () => ({
  deleteOfferAndLinkedClientData: vi.fn(),
}));

import { GET, PATCH, POST } from "@/app/api/admin/offers/route";

beforeEach(() => {
  vi.clearAllMocks();

  mocks.requireAdminFeature.mockResolvedValue({
    admin: { id: "admin-1" },
  });

  mocks.classFindMany.mockResolvedValue([]);
});

function baseOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: "offer-1",
    title: "عرض",
    titleEn: null,
    discount: 0,
    type: "special",
    appliesTo: null,
    appliesToEn: null,
    membershipId: null,
    expiresAt: new Date("2026-12-31T20:00:00.000Z"),
    isActive: true,
    description: null,
    descriptionEn: null,
    specialPrice: 560,
    maxSubscribers: 50,
    currentSubscribers: 0,
    image: null,
    showOnHome: true,
    showMaxSubscribers: true,
    showCurrentSubscribers: true,
    sessionsCount: 12,
    durationDays: 30,
    priceBefore: 700,
    features: null,
    featuresEn: null,
    allowedClassTypes: [],
    allowedClasses: [],
    membership: null,
    friendOfferConfig: null,
    ...overrides,
  };
}

describe("Admin Friend Offer config", () => {
  it("does not create friend config for a normal offer", async () => {
    mocks.offerCreate.mockImplementation(async (args) =>
      baseOffer({
        id: "normal-1",
        type: "percentage",
        discount: 10,
        specialPrice: null,
        friendOfferConfig: null,
        __args: args,
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/admin/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "خصم عادي",
          type: "percentage",
          discount: 10,
          validUntil: "2026-12-31T22:00",
          active: true,
        }),
      }),
    );

    expect(response.status).toBe(200);

    const call = mocks.offerCreate.mock.calls[0][0];

    expect(call.data.friendOfferConfig).toBeUndefined();
  });

  it("creates friend config with required members and invite expiry", async () => {
    mocks.offerCreate.mockImplementation(async (args) =>
      baseOffer({
        id: "friend-1",
        friendOfferConfig: {
          requiredMembers: 3,
          inviteExpiryHours: 48,
          isActive: true,
        },
        __args: args,
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/admin/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "عرض الصحاب",
          type: "special",
          specialPrice: 690,
          validUntil: "2026-12-31T22:00",
          active: true,
          friendOfferEnabled: true,
          friendRequiredMembers: 3,
          friendInviteExpiryHours: 48,
        }),
      }),
    );

    expect(response.status).toBe(200);

    const call = mocks.offerCreate.mock.calls[0][0];

    expect(call.data.friendOfferConfig).toEqual({
      create: {
        requiredMembers: 3,
        inviteExpiryHours: 48,
        isActive: true,
      },
    });

    const body = await response.json();

    expect(body.friendOfferEnabled).toBe(true);
    expect(body.friendRequiredMembers).toBe(3);
    expect(body.friendInviteExpiryHours).toBe(48);
  });

  it("GET returns friend configuration", async () => {
    mocks.offerFindMany.mockResolvedValue([
      baseOffer({
        friendOfferConfig: {
          requiredMembers: 2,
          inviteExpiryHours: 24,
          isActive: true,
        },
      }),
    ]);

    const response = await GET();

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body[0].friendOfferEnabled).toBe(true);
    expect(body[0].friendRequiredMembers).toBe(2);
    expect(body[0].friendInviteExpiryHours).toBe(24);
  });

  it("disables existing friend config instead of deleting it", async () => {
    mocks.offerFindUnique.mockResolvedValue({
      type: "special",
    });

    mocks.offerUpdate.mockImplementation(async (args) =>
      baseOffer({
        friendOfferConfig: {
          requiredMembers: 2,
          inviteExpiryHours: 24,
          isActive: false,
        },
        __args: args,
      }),
    );

    const response = await PATCH(
      new Request("http://localhost/api/admin/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "offer-1",
          friendOfferEnabled: false,
          friendRequiredMembers: 2,
          friendInviteExpiryHours: 24,
        }),
      }),
    );

    expect(response.status).toBe(200);

    const call = mocks.offerUpdate.mock.calls[0][0];

    expect(call.data.friendOfferConfig).toEqual({
      upsert: {
        create: {
          requiredMembers: 2,
          inviteExpiryHours: 24,
          isActive: false,
        },
        update: {
          requiredMembers: 2,
          inviteExpiryHours: 24,
          isActive: false,
        },
      },
    });

    expect(call.data.friendOfferConfig.delete).toBeUndefined();
  });
});
