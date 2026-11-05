import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, options?: { status?: number }) =>
      Response.json(body, options),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/push", () => ({
  sendOnePush: vi.fn(),
}));

vi.mock("@/lib/payments/pending-membership-cleanup", () => ({
  cleanupExpiredPendingMembership: vi.fn(),
}));

vi.mock("@/lib/payments/expired-membership-settlement", () => ({
  settleExpiredPendingMembership: vi.fn(),
}));

vi.mock("@/lib/membership-lifecycle", () => ({
  expireEndedActiveMembershipsTx: vi.fn(),
}));

vi.mock("@/lib/schedule-maintenance", () => ({
  extendRecurringSchedules: vi.fn(),
}));

import { GET } from "@/app/api/cron/cancel-pending-payments/route";

describe("cancel pending payments preview isolation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("blocks background execution before DB or Paymob operations", async () => {
    vi.stubEnv("FITZONE_DISABLE_BACKGROUND_JOBS", "1");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("CRON_SECRET", "isolated-test-secret");

    const response = await GET(
      new Request("http://localhost/api/cron/cancel-pending-payments", {
        headers: { "x-cron-secret": "isolated-test-secret" },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Background jobs disabled",
    });

    const { extendRecurringSchedules } =
      await import("@/lib/schedule-maintenance");
    const { settleExpiredPendingMembership } =
      await import("@/lib/payments/expired-membership-settlement");

    expect(extendRecurringSchedules).not.toHaveBeenCalled();
    expect(settleExpiredPendingMembership).not.toHaveBeenCalled();
  });
});