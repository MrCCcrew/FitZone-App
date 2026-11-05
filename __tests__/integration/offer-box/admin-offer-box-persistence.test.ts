import { afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("REFUSING: DATABASE_URL missing");

const url = new URL(raw);
if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error("REFUSING: fitzone_test isolation required");
}

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn().mockResolvedValue({
    admin: { id: "test-admin" },
  }),
}));

vi.mock("@/lib/public-cache", () => ({
  clearPublicApiCache: vi.fn(),
}));

vi.mock("@/lib/audit-context", () => ({
  logAudit: vi.fn(),
  getAuditActor: vi.fn(() => null),
}));

const db = new PrismaClient();
const stamp = `TEST-ADMIN-OFFERBOX-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdIds: string[] = [];
let testMembershipId: string | null = null;

afterAll(async () => {
  try {
    await db.offer.deleteMany({
      where: {
        OR: [
          { id: { in: createdIds } },
          { title: { startsWith: stamp } },
        ],
      },
    });
    if (testMembershipId) await db.membership.deleteMany({ where: { id: testMembershipId } });
  } finally {
    await db.$disconnect();
  }
});

describe("Admin Offer Box real persistence", () => {
  it("persists POST defaults, GET flags and PATCH toggles", async () => {
    const { POST, GET, PATCH } =
      await import("@/app/api/admin/offers/route");


    async function create(enabled?: boolean) {
      const response = await POST(
        new Request("http://localhost/api/admin/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${stamp}-${enabled === true ? "ON" : "OFF"}`,
            type: "special",
            specialPrice: 560,
            validUntil: "2027-12-31T22:00",
            active: true,
            ...(enabled === undefined ? {} : { offerBoxEnabled: enabled }),
          }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(typeof body.id).toBe("string");
      createdIds.push(body.id);
      expect(body.offerBoxEnabled).toBe(enabled ?? false);
      return body.id as string;
    }

    const defaultId = await create();
    const enabledId = await create(true);

    const getResponse = await GET();
    expect(getResponse.status).toBe(200);

    const offers = await getResponse.json();
    expect(offers.find((o: any) => o.id === defaultId)?.offerBoxEnabled).toBe(false);
    expect(offers.find((o: any) => o.id === enabledId)?.offerBoxEnabled).toBe(true);

    for (const [id, enabled] of [
      [defaultId, true],
      [enabledId, false],
    ] as const) {
      const response = await PATCH(
        new Request("http://localhost/api/admin/offers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            offerBoxEnabled: enabled,
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).offerBoxEnabled).toBe(enabled);

      const saved = await db.offer.findUnique({
        where: { id },
        select: { offerBoxEnabled: true },
      });
      expect(saved?.offerBoxEnabled).toBe(enabled);
    }
  });

  it("admin alone opts in or out of the additional Offer Box discount", async () => {
    const { POST, GET, PATCH } = await import("@/app/api/admin/offers/route");
    const membership = await db.membership.create({
      data: { name: `${stamp}-PLAN`, price: 100, priceAfter: 90, duration: 30, features: "[]", isActive: true },
    });
    testMembershipId = membership.id;
    const create = async (apply?: boolean) => {
      const response = await POST(new Request("http://localhost/api/admin/offers", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `${stamp}-DISCOUNT-${apply ? "YES" : "NO"}`,
          type: "percentage", discount: 20, specialPrice: 0,
          membershipId: membership.id, offerBoxEnabled: true,
          ...(apply === undefined ? {} : { offerBoxApplyDiscount: apply }),
          validUntil: "2027-12-31T22:00", active: true,
        }),
      }));
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(200);
      createdIds.push(body.id);
      return body;
    };
    const off = await create();
    const on = await create(true);
    expect(off.offerBoxApplyDiscount).toBe(false);
    expect(on.offerBoxApplyDiscount).toBe(true);
    const stored = await db.offer.findMany({
      where: { id: { in: [off.id, on.id] } },
      select: { id: true, offerBoxApplyDiscount: true, specialPrice: true },
    });
    expect(stored.find(o => o.id === on.id)?.offerBoxApplyDiscount).toBe(true);
    expect(stored.find(o => o.id === off.id)?.offerBoxApplyDiscount).toBe(false);
    expect(stored.every(o => o.specialPrice === null)).toBe(true);

    for (const [id, enabled] of [[off.id, true], [on.id, false]] as const) {
      const response = await PATCH(new Request("http://localhost/api/admin/offers", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, offerBoxApplyDiscount: enabled }),
      }));
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.offerBoxApplyDiscount).toBe(enabled);
      expect((await db.offer.findUniqueOrThrow({ where: { id } })).offerBoxApplyDiscount).toBe(enabled);
    }
    const offers = await (await GET()).json();
    expect(offers.find((o: { id: string }) => o.id === off.id)?.offerBoxApplyDiscount).toBe(true);
    expect(offers.find((o: { id: string }) => o.id === on.id)?.offerBoxApplyDiscount).toBe(false);
    const rejected = await PATCH(new Request("http://localhost/api/admin/offers", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: off.id, offerBoxApplyDiscount: true, discount: 101 }),
    }));
    expect(rejected.status).toBe(400);
  });

  it("lets admin opt a student offer into national-ID age checks without affecting existing offers", async () => {
    const { GET, POST, PATCH } = await import("@/app/api/admin/offers/route");
    const response = await POST(new Request("http://localhost/api/admin/offers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${stamp}-STUDENT-NATIONAL-ID`,
        type: "special", specialPrice: 90, validUntil: "2027-12-31T22:00",
        requiresBirthDate: true, requiresEgyptianNationalId: true,
        minAgeYears: 13, maxAgeYears: 25,
      }),
    }));
    const created = await response.json();
    expect(response.status, JSON.stringify(created)).toBe(200);
    createdIds.push(created.id);
    expect(created.requiresEgyptianNationalId).toBe(true);

    const current = await db.offer.findUniqueOrThrow({ where: { id: created.id } });
    expect(current.requiresEgyptianNationalId).toBe(true);
    expect(current.minAgeYears).toBe(13);
    expect(current.maxAgeYears).toBe(25);

    const all = await (await GET()).json();
    expect(all.find((o: { id: string }) => o.id === created.id)?.requiresEgyptianNationalId).toBe(true);

    const patch = await PATCH(new Request("http://localhost/api/admin/offers", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: created.id, requiresEgyptianNationalId: false }),
    }));
    expect(patch.status).toBe(200);
    expect((await patch.json()).requiresEgyptianNationalId).toBe(false);
    expect((await db.offer.findUniqueOrThrow({ where: { id: created.id } })).requiresEgyptianNationalId).toBe(false);
  });
});