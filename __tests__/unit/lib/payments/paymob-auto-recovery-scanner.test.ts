import { describe, expect, it, vi } from "vitest";
import {
  scanPaymobRecoveryCandidates,
  isPaymobReconciliationComplete,
} from "@/lib/payments/paymob-auto-recovery-scanner";

function mockDb(payments: any[], memberships: any[]) {
  const findPayments = vi.fn().mockResolvedValue(payments);
  const findMemberships = vi.fn().mockResolvedValue(memberships);

  return {
    db: {
      paymentTransaction: { findMany: findPayments },
      userMembership: { findMany: findMemberships },
    },
    findPayments,
    findMemberships,
  };
}

describe("Paymob recovery scanner real Prisma contract", () => {
  it("loads membership status separately from payment records", async () => {
    const { db, findPayments, findMemberships } = mockDb(
      [{
        id: "payment-1",
        createdAt: new Date("2026-10-29T10:00:00.000Z"),
        purpose: "membership",
        provider: "paymob",
        status: "pending",
        membershipId: "membership-1",
        metadata: null,
      }],
      [{ id: "membership-1", status: "pending_payment" }],
    );

    expect((await scanPaymobRecoveryCandidates(db)).candidates).toEqual([
      { paymentId: "payment-1", decision: "inquire_only" },
    ]);

    expect(findPayments.mock.calls[0][0].select.metadata).toBe(true);
    expect(findMemberships).toHaveBeenCalledOnce();
  });

  it("identifies paid payments requiring activation", async () => {
    const { db } = mockDb(
      [{
        id: "payment-2",
        createdAt: new Date("2026-10-29T10:00:00.000Z"),
        purpose: "membership",
        provider: "paymob",
        status: "paid",
        membershipId: "membership-2",
        metadata: null,
      }],
      [{ id: "membership-2", status: "pending_payment" }],
    );

    expect((await scanPaymobRecoveryCandidates(db)).candidates).toEqual([
      { paymentId: "payment-2", decision: "repair_paid_membership" },
    ]);
  });

  it("skips paid and reconciled active memberships", async () => {
    const { db } = mockDb(
      [{
        id: "payment-3",
        createdAt: new Date("2026-10-29T10:00:00.000Z"),
        purpose: "membership",
        provider: "paymob",
        status: "paid",
        membershipId: "membership-3",
        metadata: JSON.stringify({
          postActivationReconciliation: {
            completed: true,
            userMembershipId: "membership-3",
          },
        }),
      }],
      [{ id: "membership-3", status: "active" }],
    );

    expect((await scanPaymobRecoveryCandidates(db)).candidates).toEqual([
      { paymentId: "payment-3", decision: "skip" },
    ]);
  });

  it("rejects incorrectly linked completion markers", () => {
    expect(isPaymobReconciliationComplete(
      JSON.stringify({
        postActivationReconciliation: {
          completed: true,
          userMembershipId: "another-membership",
        },
      }),
      "membership-1",
    )).toBe(false);
  });

  it("rejects invalid scan limits without touching DB", async () => {
    const { db, findPayments } = mockDb([], []);

    await expect(scanPaymobRecoveryCandidates(
      db, 101,
    )).rejects.toThrow("INVALID_RECOVERY_SCAN_LIMIT");

    expect(findPayments).not.toHaveBeenCalled();
  });
});


describe("Paymob scanner keyset pagination", () => {
  it("uses a stable cursor and returns the last scanned row", async () => {
    const createdAt = new Date("2026-10-29T10:00:00Z");
    const { db, findPayments } = mockDb(
      [{
        id: "payment-10",
        createdAt,
        purpose: "membership",
        provider: "paymob",
        status: "pending",
        membershipId: "membership-10",
        metadata: null,
      }],
      [{ id: "membership-10", status: "pending_payment" }],
    );

    const cursor = { createdAt, id: "payment-05" };

    const result = await scanPaymobRecoveryCandidates(
      db, 1, cursor,
    );

    expect(result.nextCursor).toEqual({
      createdAt,
      id: "payment-10",
    });
    expect(result.hasMore).toBe(true);
    expect(findPayments.mock.calls[0][0].where).toEqual({
      AND: [
        expect.objectContaining({
          provider: "paymob",
          purpose: "membership",
        }),
        {
          OR: [
            { createdAt: { gt: createdAt } },
            {
              createdAt,
              id: { gt: "payment-05" },
            },
          ],
        },
      ],
    });
  });

  it("signals an exhausted scan without losing candidates", async () => {
    const { db } = mockDb([], []);
    const result = await scanPaymobRecoveryCandidates(db);

    expect(result.candidates).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });
});
