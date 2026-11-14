import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  transaction: vi.fn(),
  settingsRead: vi.fn(),
  offersRead: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  offerFindMany: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: m.session,
}));

vi.mock("@/lib/r2", () => ({
  R2_PUBLIC_URL: "https://example.invalid",
}));

vi.mock("@/lib/db", () => ({
  db: {
    popupSettings: {
      findUnique: m.settingsRead,
    },
    popupOffer: {
      findMany: m.offersRead,
    },
    $transaction: m.transaction,
  },
}));

import {
  GET,
  PUT,
} from "@/app/api/admin/popup/atomic/route";

const current = {
  id: "main",
  enabled: true,
  ribbonText: "Original Campaign",
  endDate: new Date("2099-01-01T00:00:00.000Z"),
  showDelaySeconds: 2.5,
  hideHours: 24,
  revision: 4,
  updatedAt: new Date("2026-11-13T00:00:00.000Z"),
};

function payload(
  expectedRevision = 4,
  offers: unknown[] = [],
) {
  return {
    expectedRevision,
    settings: {
      enabled: true,
      ribbonText: "Updated Campaign",
      endDate: "2099-01-01T00:00:00.000Z",
      showDelaySeconds: 2.5,
      hideHours: 24,
    },
    offers,
  };
}

function request(body: unknown) {
  return new Request(
    "http://localhost/api/admin/popup/atomic",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const tx = {
  popupSettings: {
    upsert: m.upsert,
    updateMany: m.updateMany,
    findUniqueOrThrow: m.findUniqueOrThrow,
  },
  popupOffer: {
    deleteMany: m.deleteMany,
    createMany: m.createMany,
    findMany: m.offersRead,
  },
  offer: {
    findMany: m.offerFindMany,
  },
};

beforeEach(() => {
  vi.resetAllMocks();

  m.session.mockResolvedValue({ role: "admin" });
  m.settingsRead.mockResolvedValue(current);
  m.offersRead.mockResolvedValue([]);

  m.upsert.mockResolvedValue(current);
  m.updateMany.mockResolvedValue({ count: 1 });

  m.findUniqueOrThrow.mockResolvedValue({
    ...current,
    enabled: true,
    ribbonText: "Updated Campaign",
    revision: 5,
  });

  m.offerFindMany.mockResolvedValue([]);
  m.deleteMany.mockResolvedValue({ count: 0 });
  m.createMany.mockResolvedValue({ count: 0 });

  m.transaction.mockImplementation(async (operation: unknown) => {
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }

    if (typeof operation === "function") {
      return operation(tx);
    }

    throw new Error("Unexpected transaction contract");
  });
});

describe("R50-R52 - Atomic popup runtime", () => {
  it("rejects unauthenticated reading and writing", async () => {
    m.session.mockResolvedValue(null);

    const get = await GET();
    const put = await PUT(request(payload()));

    expect(get.status).toBe(401);
    expect(put.status).toBe(401);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("rejects non-admin writes", async () => {
    m.session.mockResolvedValue({ role: "staff" });

    const response = await PUT(request(payload()));

    expect(response.status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("reads settings and offers through one transaction", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.revision).toBe(4);
    expect(body.offers).toEqual([]);
    expect(m.transaction).toHaveBeenCalledOnce();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("rejects a missing expectedRevision", async () => {
    const input = payload() as Record<string, unknown>;
    delete input.expectedRevision;

    const response = await PUT(request(input));

    expect(response.status).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed campaign settings", async () => {
    const input = payload();
    input.settings.showDelaySeconds = 90;

    const response = await PUT(request(input));

    expect(response.status).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("rejects more than three popup offers", async () => {
    const offers = [1, 2, 3, 4].map((index) => ({
      offerId: `offer_${index}`,
      imageUrl: null,
      badge: null,
      sortOrder: index,
      isActive: true,
    }));

    const response = await PUT(request(payload(4, offers)));

    expect(response.status).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("saves campaign and returns incremented revision", async () => {
    const response = await PUT(request(payload()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.revision).toBe(5);

    expect(m.transaction).toHaveBeenCalledOnce();

    expect(m.updateMany).toHaveBeenCalledWith({
      where: {
        id: "main",
        revision: 4,
      },
      data: expect.objectContaining({
        revision: { increment: 1 },
        ribbonText: "Updated Campaign",
      }),
    });

    expect(m.deleteMany).toHaveBeenCalledOnce();
    expect(m.findUniqueOrThrow).toHaveBeenCalledOnce();
  });

  it("rejects stale revision before modifying offer links", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });

    const response = await PUT(request(payload(3)));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBeTruthy();

    expect(m.deleteMany).not.toHaveBeenCalled();
    expect(m.createMany).not.toHaveBeenCalled();
  });

  it("fails when an offer does not exist", async () => {
    const offers = [{
      offerId: "nonexistent_offer",
      imageUrl: null,
      badge: null,
      sortOrder: 1,
      isActive: true,
    }];

    m.offerFindMany.mockResolvedValue([]);

    const response = await PUT(request(payload(4, offers)));

    expect(response.status).toBe(400);
    expect(m.deleteMany).not.toHaveBeenCalled();
  });

  it("reports failure when offer creation fails", async () => {
    const offers = [{
      offerId: "existing_offer",
      imageUrl: null,
      badge: null,
      sortOrder: 1,
      isActive: true,
    }];

    m.offerFindMany.mockResolvedValue([
      { id: "existing_offer" },
    ]);

    m.createMany.mockRejectedValue(
      new Error("Simulated database write failure"),
    );

    const response = await PUT(request(payload(4, offers)));

    expect(response.status).toBe(500);
    expect(m.deleteMany).toHaveBeenCalledOnce();
    expect(m.createMany).toHaveBeenCalledOnce();
  });

  it("maps Prisma serialization conflicts to HTTP 409", async () => {
    m.transaction.mockRejectedValue(
      Object.assign(new Error("Write conflict"), {
        code: "P2034",
      }),
    );

    const response = await PUT(request(payload()));

    expect(response.status).toBe(409);
  });

  it("rejects invalid image URLs before writing", async () => {
    const offers = [{
      offerId: "existing_offer",
      imageUrl: "https://untrusted.invalid/image.webp",
      badge: null,
      sortOrder: 1,
      isActive: true,
    }];

    const response = await PUT(request(payload(4, offers)));

    expect(response.status).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});