import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  findMany: vi.fn(),
  inquire: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: { findMany: mocks.findMany },
  },
}));

vi.mock("@/lib/payments/expired-membership-paymob-reconciliation", () => ({
  reconcileExpiredPaymobMembership: mocks.reconcile,
}));

vi.mock("@/lib/payments/providers/paymob", () => ({
  inquirePaymobUnpaidOrder: mocks.inquire,
}));

vi.mock("@/lib/payments/pending-membership-cleanup", () => ({
  cleanupExpiredPendingMembership: mocks.cleanup,
}));

import {
  settleExpiredPendingMembership,
} from "@/lib/payments/expired-membership-settlement";

const payment = {
  id: "payment-1",
  status: "pending",
  providerPayload: '{"intentionOrderId":"123456"}',
  amount: 343,
  currency: "EGP",
};

const unpaidProof = {
  paymentId: "payment-1",
  merchantOrderId: "payment-1",
  orderId: "123456",
  amountCents: 34300,
  currency: "EGP",
  paidAmountCents: 0,
  checkedAt: new Date().toISOString(),
};

describe("Expired membership automated settlement wiring", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reconcile.mockResolvedValue({ kind: "unresolved" });
    mocks.findMany.mockResolvedValue([payment]);
    mocks.inquire.mockResolvedValue(unpaidProof);
    mocks.cleanup.mockResolvedValue({
      cleaned: true,
      membershipId: "membership-1",
      userId: "user-1",
      planName: "Plan",
      deletedBookings: 3,
    });
  });

  it("passes matching unpaid proof to atomic cleanup", async () => {
    const result = await settleExpiredPendingMembership("membership-1");

    expect(result.kind).toBe("cleanup");
    expect(mocks.cleanup).toHaveBeenCalledWith(
      "membership-1",
      expect.any(Date),
      unpaidProof,
    );
  });

  it("never cancels a verified paid membership", async () => {
    mocks.reconcile.mockResolvedValue({ kind: "paid_recovered" });

    expect(
      await settleExpiredPendingMembership("membership-1")
    ).toEqual({ kind: "paid_recovered" });

    expect(mocks.inquire).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("fails closed on an unavailable or 404 order", async () => {
    mocks.inquire.mockResolvedValue(null);

    await settleExpiredPendingMembership("membership-1");

    expect(mocks.cleanup).toHaveBeenCalledWith(
      "membership-1",
      expect.any(Date),
      null,
    );
  });

  it("does not infer unpaid with multiple Paymob payments", async () => {
    mocks.findMany.mockResolvedValue([
      payment,
      { ...payment, id: "payment-2" },
    ]);

    await settleExpiredPendingMembership("membership-1");

    expect(mocks.inquire).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledWith(
      "membership-1",
      expect.any(Date),
      null,
    );
  });

  it("does not infer unpaid from a paid local payment", async () => {
    mocks.findMany.mockResolvedValue([
      { ...payment, status: "paid" },
    ]);

    await settleExpiredPendingMembership("membership-1");

    expect(mocks.inquire).not.toHaveBeenCalled();
  });

  it("leaves manual guard in place when provider is unavailable", async () => {
    mocks.reconcile.mockRejectedValue(new Error("provider unavailable"));
    mocks.inquire.mockResolvedValue(null);

    await settleExpiredPendingMembership("membership-1");

    expect(mocks.cleanup).toHaveBeenCalledWith(
      "membership-1",
      expect.any(Date),
      null,
    );
  });

  it("connects the same settlement to cron and subscribe retry", () => {
    const cron = readFileSync(
      resolve(process.cwd(),
        "src/app/api/cron/cancel-pending-payments/route.ts"),
      "utf8",
    );

    const cleanup = readFileSync(
      resolve(process.cwd(),
        "src/lib/payments/pending-membership-cleanup.ts"),
      "utf8",
    );

    const subscribe = readFileSync(
      resolve(process.cwd(), "src/app/api/subscribe/route.ts"),
      "utf8",
    );

    expect(cron).toContain(
      "await settleExpiredPendingMembership(membership.id)"
    );
    expect(cleanup).toContain(
      "await settleExpiredPendingMembership(membership.id)"
    );
    expect(subscribe).toContain(
      "await cleanupExpiredPendingMembershipsForUser(userId)"
    );
  });
});
