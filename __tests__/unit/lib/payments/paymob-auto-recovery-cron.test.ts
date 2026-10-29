import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cycle: vi.fn(),
}));

vi.mock("@/lib/payments/paymob-auto-recovery-live-cycle", () => ({
  runRealPaymobRecoveryCycle: mocks.cycle,
}));

import { GET } from "@/app/api/cron/paymob-auto-recovery/route";

describe("Paymob secure cron endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CRON_SECRET = "test-secret-123";
  });

  it("rejects missing authorization", async () => {
    const request = new NextRequest(
      "http://localhost/api/cron/paymob-auto-recovery",
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mocks.cycle).not.toHaveBeenCalled();
  });

  it("rejects incorrect secret", async () => {
    const request = new NextRequest(
      "http://localhost/api/cron/paymob-auto-recovery",
      { headers: { authorization: "Bearer wrong-secret" } },
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mocks.cycle).not.toHaveBeenCalled();
  });

  it("executes one cycle when authorized", async () => {
    mocks.cycle.mockResolvedValue({
      discovery: { pages: 1 },
      execution: { selected: 0, succeeded: 0, failed: 0 },
    });

    const request = new NextRequest(
      "http://localhost/api/cron/paymob-auto-recovery",
      { headers: { authorization: "Bearer test-secret-123" } },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.cycle).toHaveBeenCalledOnce();
  });

  it("returns a safe error if recovery fails", async () => {
    mocks.cycle.mockRejectedValue(new Error("Sensitive provider data"));

    const request = new NextRequest(
      "http://localhost/api/cron/paymob-auto-recovery",
      { headers: { authorization: "Bearer test-secret-123" } },
    );

    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json()))
      .not.toContain("Sensitive provider data");
  });
});
