import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  settingsFindUnique: vi.fn(),
  settingsUpsert: vi.fn(),
  popupFindMany: vi.fn(),
  offerFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: mocks.getAdminSession,
}));

vi.mock("@/lib/db", () => ({
  db: {
    popupSettings: {
      findUnique: mocks.settingsFindUnique,
      upsert: mocks.settingsUpsert,
    },
    popupOffer: {
      findMany: mocks.popupFindMany,
    },
    offer: {
      findMany: mocks.offerFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/r2", () => ({
  R2_PUBLIC_URL: "https://example.invalid",
}));

import { GET as publicGET } from "@/app/api/popup/route";
import {
  GET as settingsGET,
  PATCH as settingsPATCH,
} from "@/app/api/admin/popup/settings/route";
import {
  GET as offersGET,
  PUT as offersPUT,
} from "@/app/api/admin/popup/offers/route";

function makeRequest(path: string, method: string, body: string) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.getAdminSession.mockResolvedValue(null);
  mocks.settingsFindUnique.mockResolvedValue(null);
  mocks.popupFindMany.mockResolvedValue([]);
  mocks.offerFindMany.mockResolvedValue([]);
});

describe("R41 - Public Pink Friday API", () => {
  it("closes safely without settings", async () => {
    const response = await publicGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.offers).toEqual([]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.popupFindMany).not.toHaveBeenCalled();
  });

  it("closes an expired campaign", async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      id: "main",
      enabled: true,
      endDate: new Date("2020-01-01T00:00:00.000Z"),
    });

    const response = await publicGET();
    const body = await response.json();

    expect(body.enabled).toBe(false);
    expect(body.offers).toEqual([]);
    expect(mocks.popupFindMany).not.toHaveBeenCalled();
  });

  it("closes an active campaign without eligible offers", async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      id: "main",
      enabled: true,
      ribbonText: "Pink Friday",
      endDate: new Date("2099-01-01T00:00:00.000Z"),
      showDelaySeconds: 2.5,
      hideHours: 24,
      updatedAt: new Date("2026-11-13T00:00:00.000Z"),
    });

    const response = await publicGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.reason).toBe("no_active_offers");
    expect(body.offers).toEqual([]);
    expect(mocks.popupFindMany).toHaveBeenCalledOnce();
  });

  it("fails closed on a database error", async () => {
    mocks.settingsFindUnique.mockRejectedValue(new Error("DB failure"));

    const response = await publicGET();
    const body = await response.json();

    expect(body.enabled).toBe(false);
    expect(body.offers).toEqual([]);
    expect(body.reason).toBe("unavailable");
  });
});

describe("R43 - Eligibility regression", () => {
  function activeSettings() {
    return {
      id: "main",
      enabled: true,
      ribbonText: "Pink Friday",
      endDate: new Date("2099-01-01T00:00:00.000Z"),
      showDelaySeconds: 2.5,
      hideHours: 24,
      updatedAt: new Date("2026-11-13T00:00:00.000Z"),
    };
  }

  function makeOffer(overrides: Record<string, unknown> = {}) {
    return {
      id: "r43_offer",
      title: "R43 Test Offer",
      titleEn: null,
      type: "percentage",
      discount: 20,
      specialPrice: null,
      priceBefore: 100,
      durationDays: null,
      sessionsCount: 4,
      features: null,
      featuresEn: null,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      maxSubscribers: 10,
      currentSubscribers: 0,
      membershipId: null,
      membership: null,
      image: null,
      offerBoxEnabled: true,
      friendOfferConfig: null,
      ...overrides,
    };
  }

  function makeRow(
    id: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      imageUrl: null,
      badge: null,
      sortOrder: 1,
      offer: makeOffer({
        id: id + "_offer",
        ...overrides,
      }),
    };
  }

  beforeEach(() => {
    mocks.settingsFindUnique.mockResolvedValue(activeSettings());
  });

  it("filters sold-out, disabled friend and invalid membership offers", async () => {
    mocks.popupFindMany.mockResolvedValue([
      makeRow("sold_out", {
        currentSubscribers: 10,
        maxSubscribers: 10,
      }),
      makeRow("disabled_friend", {
        friendOfferConfig: {
          id: "friend_config",
          isActive: false,
        },
      }),
      makeRow("invalid_membership", {
        offerBoxEnabled: false,
        membershipId: null,
      }),
    ]);

    const response = await publicGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.reason).toBe("no_active_offers");
    expect(body.offers).toEqual([]);
  });

  it("allows an independent Offer Box without membership", async () => {
    mocks.popupFindMany.mockResolvedValue([
      makeRow("independent_box", {
        membershipId: null,
        membership: null,
        offerBoxEnabled: true, specialPrice: 280,
      }),
    ]);

    const response = await publicGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0].kind).toBe("offer_box");
    expect(body.offers[0].membershipId).toBeNull();
    expect(body.offers[0].checkout).toEqual({
      offerId: "independent_box_offer",
      kind: "offer_box",
    });
  });

  it("keeps active friend offers separate from membership", async () => {
    mocks.popupFindMany.mockResolvedValue([
      makeRow("active_friend", {
        offerBoxEnabled: false,
        membershipId: null,
        friendOfferConfig: {
          id: "friend_active",
          isActive: true,
        },
      }),
    ]);

    const response = await publicGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0].kind).toBe("friend_offer");
    expect(body.offers[0].membershipId).toBeNull();
  });

  it("queries only active, non-expired offers with stable order and limit", async () => {
    mocks.popupFindMany.mockResolvedValue([
      makeRow("eligible_box"),
    ]);

    await publicGET();

    expect(mocks.popupFindMany).toHaveBeenCalledOnce();

    const query = mocks.popupFindMany.mock.calls[0][0];

    expect(query.where.isActive).toBe(true);
    expect(query.where.offer.isActive).toBe(true);
    expect(query.where.offer.expiresAt.gt).toBeInstanceOf(Date);

    expect(query.orderBy).toEqual([
      { sortOrder: "asc" },
      { id: "asc" },
    ]);

    expect(query.take).toBe(3);
  });
});
describe("R41 - Admin settings authorization", () => {
  it("rejects unauthenticated GET and PATCH", async () => {
    const get = await settingsGET();

    const patch = await settingsPATCH(
      makeRequest("/api/admin/popup/settings", "PATCH", "{}"),
    );

    expect(get.status).toBe(401);
    expect(patch.status).toBe(401);
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects non-admin GET and PATCH", async () => {
    mocks.getAdminSession.mockResolvedValue({
      role: "staff",
    });

    const get = await settingsGET();

    const patch = await settingsPATCH(
      makeRequest("/api/admin/popup/settings", "PATCH", "{}"),
    );

    expect(get.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without writing", async () => {
    mocks.getAdminSession.mockResolvedValue({
      role: "admin",
    });

    const response = await settingsPATCH(
      makeRequest("/api/admin/popup/settings", "PATCH", "{"),
    );

    expect(response.status).toBe(400);
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });
});

describe("R41 - Admin popup offers authorization", () => {
  it("rejects unauthenticated GET and PUT", async () => {
    const get = await offersGET();

    const put = await offersPUT(
      makeRequest("/api/admin/popup/offers", "PUT", "{}"),
    );

    expect(get.status).toBe(401);
    expect(put.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects non-admin GET and PUT", async () => {
    mocks.getAdminSession.mockResolvedValue({
      role: "staff",
    });

    const get = await offersGET();

    const put = await offersPUT(
      makeRequest("/api/admin/popup/offers", "PUT", "{}"),
    );

    expect(get.status).toBe(403);
    expect(put.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without deleting offers", async () => {
    mocks.getAdminSession.mockResolvedValue({
      role: "admin",
    });

    const response = await offersPUT(
      makeRequest("/api/admin/popup/offers", "PUT", "{"),
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});