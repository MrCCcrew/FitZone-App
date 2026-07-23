/**
 * Release 0: Unit tests for /api/payments/checkout
 *
 * Tests wallet_topup maintenance guard with mocks.
 * NO live Paymob calls, NO real DB writes, NO production data.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/payments/checkout/route";
import * as appSession from "@/lib/app-session";
import * as paymentService from "@/lib/payments/service";
import { db } from "@/lib/db";

// Mock modules
vi.mock("@/lib/app-session");
vi.mock("@/lib/payments/service");
vi.mock("@/lib/db", () => ({
  db: {
    order: { findFirst: vi.fn() },
    offer: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

describe("POST /api/payments/checkout - Release 0", () => {
  const mockUser = { id: "user_test_123", name: "Test User", email: "test@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    (appSession.getCurrentAppUser as Mock).mockResolvedValue(mockUser);
  });

  /**
   * Test A: wallet_topup → 503 maintenance
   */
  it("should block wallet_topup with 503 maintenance error", async () => {
    const mockRequest = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({
        purpose: "wallet_topup",
        amount: 100,
        currency: "EGP",
        provider: "paymob",
        paymentMethod: "paymob",
      }),
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    // Assert 503 status
    expect(response.status).toBe(503);

    // Assert error structure
    expect(json).toEqual({
      error: "خدمة شحن المحفظة متوقفة مؤقتًا للصيانة.",
      code: "WALLET_TOPUP_MAINTENANCE",
    });

    // Assert headers
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("3600");

    // Assert NO DB operations
    expect(db.order.findFirst).not.toHaveBeenCalled();
    expect(db.offer.findUnique).not.toHaveBeenCalled();
    expect(db.membership.findUnique).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();

    // Assert NO PaymentTransaction created
    expect(paymentService.createPaymentTransaction).not.toHaveBeenCalled();
  });

  /**
   * Test B: order purpose → NOT blocked
   */
  it("should allow order purpose to pass guard", async () => {
    const mockOrder = { id: "order_123", total: 250, status: "pending_payment" };
    const mockTransaction = {
      id: "tx_order_123",
      status: "pending",
      checkoutUrl: "https://paymob.test/checkout/order",
    };

    (db.order.findFirst as Mock).mockResolvedValue(mockOrder);
    (paymentService.createPaymentTransaction as Mock).mockResolvedValue(mockTransaction);

    const mockRequest = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({
        purpose: "order",
        orderId: "order_123",
        provider: "paymob",
        paymentMethod: "paymob",
      }),
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    // Assert success (NOT 503)
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    // Assert order lookup happened
    expect(db.order.findFirst).toHaveBeenCalledWith({
      where: { id: "order_123", userId: mockUser.id },
      select: { id: true, total: true, status: true },
    });

    // Assert PaymentTransaction created
    expect(paymentService.createPaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "order",
        amount: 250,
        orderId: "order_123",
      })
    );
  });

  /**
   * Test C: membership purpose → NOT blocked
   */
  it("should allow membership purpose to pass guard", async () => {
    const mockMembership = { name: "Gold Plan", price: 500, isActive: true };
    const mockTransaction = {
      id: "tx_membership_123",
      status: "pending",
      checkoutUrl: "https://paymob.test/checkout/membership",
    };

    (db.membership.findUnique as Mock).mockResolvedValue(mockMembership);
    (paymentService.createPaymentTransaction as Mock).mockResolvedValue(mockTransaction);

    const mockRequest = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({
        purpose: "membership",
        membershipId: "membership_gold_123",
        provider: "paymob",
        paymentMethod: "paymob",
      }),
    });

    const response = await POST(mockRequest);
    const json = await response.json();

    // Assert success (NOT 503)
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    // Assert membership lookup happened
    expect(db.membership.findUnique).toHaveBeenCalledWith({
      where: { id: "membership_gold_123" },
      select: { name: true, price: true, isActive: true },
    });

    // Assert PaymentTransaction created
    expect(paymentService.createPaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "membership",
        amount: 500,
        membershipId: "membership_gold_123",
      })
    );
  });

  /**
   * Test D: Guard is exclusive to wallet_topup
   */
  it("should prove guard is strictly conditional on purpose === wallet_topup", async () => {
    // Test with empty/null purpose (defaults to "order")
    const mockRequest = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({
        // purpose omitted → defaults to "order"
        orderId: "order_999",
        provider: "paymob",
        paymentMethod: "paymob",
      }),
    });

    (db.order.findFirst as Mock).mockResolvedValue({ id: "order_999", total: 100, status: "pending_payment" });
    (paymentService.createPaymentTransaction as Mock).mockResolvedValue({ id: "tx_999", status: "pending" });

    const response = await POST(mockRequest);

    // Assert NOT blocked (should reach order processing)
    expect(response.status).not.toBe(503);
    expect(db.order.findFirst).toHaveBeenCalled();
  });
});
