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

import {
  GET as settingsGET,
  PATCH as settingsPATCH,
} from "@/app/api/admin/popup/settings/route";

import {
  PUT as offersPUT,
} from "@/app/api/admin/popup/offers/route";

const existing = {
  id: "main",
  enabled: true,
  ribbonText: "Current Campaign",
  endDate: new Date("2099-01-01T00:00:00.000Z"),
  showDelaySeconds: 2.5,
  hideHours: 24,
  revision: 2,
  updatedAt: new Date("2026-11-13T00:00:00.000Z"),
};

function request(path: string, method: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAdminSession.mockResolvedValue({ role: "admin" });
  mocks.settingsFindUnique.mockResolvedValue(existing);
  mocks.popupFindMany.mockResolvedValue([]);
  mocks.offerFindMany.mockResolvedValue([]);
});

describe("R45 - Popup optimistic concurrency contract", () => {
  it("exposes a numeric revision to the admin", async () => {
    const response = await settingsGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.revision).toBe(2);
  });

  it("rejects stale settings writes with HTTP 409", async () => {
    const response = await settingsPATCH(
      request("/api/admin/popup/settings", "PATCH", {
        ribbonText: "Stale Edit",
        expectedRevision: 1,
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects stale offer-list writes with HTTP 409", async () => {
    const response = await offersPUT(
      request("/api/admin/popup/offers", "PUT", {
        expectedRevision: 1,
        offers: [],
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});