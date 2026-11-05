import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/offer-box/purchases/route";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    offerBoxPurchase: {
      findMany: vi.fn(),
    },
  },
}));

const now = new Date("2026-10-11T12:00:00.000Z");

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "purchase-1",
    userId: "user-1",
    status: "available",
    offerSnapshot: JSON.stringify({
      offer: {
        title: "عرض اللياقة",
        titleEn: "Fitness offer",
        sessionsCount: 8,
        durationDays: 30,
      },
      economics: {
        commissionSnapshot: "PRIVATE_FINANCIAL_DATA",
      },
      eligibilitySnapshot: {
        classIds: ["class-yoga", "class-yoga", " ", "class-pilates"],
        secret: "PRIVATE_ELIGIBILITY_DATA",
      },
    }),
    priceSnapshot: 500,
    currency: "EGP",
    paidAt: now,
    redeemedAt: null,
    createdAt: now,
    ...overrides,
  };
}

function request(page = "0") {
  return GET(
    new Request(`http://localhost/api/offer-box/purchases?page=${page}`),
  );
}

describe("Offer Box customer purchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentAppUser as Mock).mockResolvedValue({ id: "user-1" });
    (db.offerBoxPurchase.findMany as Mock).mockResolvedValue([
      purchase(),
    ]);
  });

  it("requires authentication before database access", async () => {
    (getCurrentAppUser as Mock).mockResolvedValue(null);

    const response = await request();

    expect(response.status).toBe(401);
    expect(db.offerBoxPurchase.findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination before database access", async () => {
    const response = await request("-1");

    expect(response.status).toBe(400);
    expect(db.offerBoxPurchase.findMany).not.toHaveBeenCalled();
  });

  it("queries only the authenticated user's paid entitlements", async () => {
    const response = await request();

    expect(response.status).toBe(200);
    expect(db.offerBoxPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          status: { in: ["available", "redeemed"] },
        },
        take: 21,
        skip: 0,
      }),
    );
  });

  it("returns a safe purchase summary without private snapshot data", async () => {
    const response = await request();
    const body = await response.json();

    expect(body.items[0].purchaseId).toBe("purchase-1");
    expect(body.items[0].title).toBe("عرض اللياقة");
    expect(body.items[0].sessionsCount).toBe(8);
    expect(body.items[0].canRedeem).toBe(true);
    expect(body.items[0].allowedClassIds).toEqual([
      "class-yoga",
      "class-pilates",
    ]);
    expect(JSON.stringify(body)).not.toContain("PRIVATE_FINANCIAL_DATA");
    expect(JSON.stringify(body)).not.toContain("PRIVATE_ELIGIBILITY_DATA");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not expose unexpected records owned by another user", async () => {
    (db.offerBoxPurchase.findMany as Mock).mockResolvedValue([
      purchase({ userId: "another-user" }),
    ]);

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("purchase-1");
  });

  it("marks redeemed offers as not redeemable again", async () => {
    (db.offerBoxPurchase.findMany as Mock).mockResolvedValue([
      purchase({ status: "redeemed", redeemedAt: now }),
    ]);

    const response = await request();
    const body = await response.json();

    expect(body.items[0].status).toBe("redeemed");
    expect(body.items[0].canRedeem).toBe(false);
  });

  it("handles a damaged snapshot without leaking its contents", async () => {
    (db.offerBoxPurchase.findMany as Mock).mockResolvedValue([
      purchase({ offerSnapshot: "{broken-json" }),
    ]);

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].purchaseId).toBe("purchase-1");
    expect(body.items[0].title).toBeTruthy();
  });

  it("fails closed when frozen class rights are missing", async () => {
    (db.offerBoxPurchase.findMany as Mock).mockResolvedValue([
      purchase({
        offerSnapshot: JSON.stringify({
          offer: { title: "Legacy offer" },
          eligibilitySnapshot: {},
        }),
      }),
    ]);

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].allowedClassIds).toEqual([]);
  });
  it("paginates customer purchases", async () => {
    (db.offerBoxPurchase.findMany as Mock).mockResolvedValue(
      Array.from({ length: 21 }, (_, i) =>
        purchase({ id: `purchase-${i}` }),
      ),
    );

    const response = await request();
    const body = await response.json();

    expect(body.items).toHaveLength(20);
    expect(body.hasMore).toBe(true);
    expect(body.nextPage).toBe(1);
  });
});