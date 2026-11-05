import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/payments/checkout/route";
import * as appSession from "@/lib/app-session";
import * as paymentService from "@/lib/payments/service";

vi.mock("@/lib/app-session");
vi.mock("@/lib/payments/service");
vi.mock("@/lib/db", () => ({ db: { order: { findFirst: vi.fn() }, offer: { findUnique: vi.fn() }, membership: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } } }));

function walletTopUpRequest(amount: unknown, currency = "EGP") {
  return new NextRequest("http://localhost/api/payments/checkout", {
    method: "POST",
    body: JSON.stringify({ purpose: "wallet_topup", amount, currency }),
  });
}

describe("wallet top-up checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (appSession.getCurrentAppUser as Mock).mockResolvedValue({ id: "user_1", name: "Test", email: "test@example.com" });
    (paymentService.createPaymentTransaction as Mock).mockResolvedValue({ id: "tx_1", status: "pending" });
  });

  it("wallet top-up enabled: creates a pending EGP transaction for valid checkout", async () => {
    const response = await POST(walletTopUpRequest(100));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, transaction: { id: "tx_1", status: "pending" } });
    expect(paymentService.createPaymentTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_1", purpose: "wallet_topup", amount: 100, currency: "EGP" }));
  });

  it("accepts the minimum amount of 10 EGP", async () => {
    const response = await POST(walletTopUpRequest(10));

    expect(response.status).toBe(200);
    expect(paymentService.createPaymentTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 10, currency: "EGP" }));
  });

  it.each([0, -1, "NaN", "Infinity", 9])("rejects invalid amount %s without creating a transaction", async (amount) => {
    const response = await POST(walletTopUpRequest(amount));

    expect(response.status).toBe(400);
    expect(paymentService.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it.each(["USD", "KWD"])("rejects unsupported currency %s without creating a transaction", async (currency) => {
    const response = await POST(walletTopUpRequest(10, currency));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("UNSUPPORTED_WALLET_CURRENCY");
    expect(paymentService.createPaymentTransaction).not.toHaveBeenCalled();
  });
});
