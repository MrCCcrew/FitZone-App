import { describe, expect, it } from "vitest";
import {
  calculatePaidMembershipRenewals,
  type RenewalMembership,
  type RenewalPayment,
} from "@/lib/reports/paid-membership-renewals";

const activation = (month: number) =>
  new Date(`2026-${String(month).padStart(2, "0")}-01T12:00:00Z`);

const membership = (
  id: string,
  userId: string,
  month: number,
): RenewalMembership => ({
  id,
  userId,
  planName: `Plan ${id}`,
  kind: "subscription",
  activatedAt: activation(month),
});

const payment = (
  id: string,
  userId: string,
  membershipId: string,
  amount: number,
  currency = "EGP",
): RenewalPayment => ({
  id,
  userId,
  membershipId,
  purpose: "membership",
  status: "paid",
  amount,
  currency,
  provider: "paymob",
  paidAt: activation(10),
});

describe("R19 renewal financial edge regression", () => {
  it("counts repeated genuine renewals, not the original purchase", () => {
    const result = calculatePaidMembershipRenewals(
      [
        membership("m1", "u1", 7),
        membership("m2", "u1", 8),
        membership("m3", "u1", 9),
      ],
      [
        payment("p1", "u1", "m1", 500),
        payment("p2", "u1", "m2", 700),
        payment("p3", "u1", "m3", 900),
      ],
    );

    expect(result.rows).toHaveLength(2);
    expect(result.totalsByCurrency.EGP).toEqual({
      count: 2,
      amount: 1600,
    });
  });

  it("keeps customer histories isolated", () => {
    const result = calculatePaidMembershipRenewals(
      [
        membership("a1", "alice", 7),
        membership("a2", "alice", 8),
        membership("b1", "bob", 7),
        membership("b2", "bob", 9),
      ],
      [
        payment("pa", "alice", "a2", 700),
        payment("pb", "bob", "b2", 900),
      ],
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.userId).sort()).toEqual([
      "alice",
      "bob",
    ]);
    expect(result.rows.find((r) => r.userId === "bob")
      ?.previousMembershipId).toBe("b1");
  });

  it("does not combine amounts from different currencies", () => {
    const result = calculatePaidMembershipRenewals(
      [
        membership("a1", "alice", 7),
        membership("a2", "alice", 8),
        membership("b1", "bob", 7),
        membership("b2", "bob", 9),
      ],
      [
        payment("pa", "alice", "a2", 700, "EGP"),
        payment("pb", "bob", "b2", 10, "KWD"),
      ],
    );

    expect(result.totalsByCurrency).toEqual({
      EGP: { count: 1, amount: 700 },
      KWD: { count: 1, amount: 10 },
    });
  });

  it("ignores failed and pending retries when one paid proof exists", () => {
    const successful = payment("paid", "u1", "m2", 900);

    const result = calculatePaidMembershipRenewals(
      [membership("m1", "u1", 7), membership("m2", "u1", 8)],
      [
        { ...successful, id: "pending", status: "pending" },
        { ...successful, id: "failed", status: "failed" },
        successful,
      ],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].paymentId).toBe("paid");
    expect(result.anomalies).toHaveLength(0);
  });

  it("excludes only the disputed renewal, preserving clean renewals", () => {
    const result = calculatePaidMembershipRenewals(
      [
        membership("a1", "alice", 7),
        membership("a2", "alice", 8),
        membership("b1", "bob", 7),
        membership("b2", "bob", 9),
      ],
      [
        payment("a-paid-1", "alice", "a2", 500),
        payment("a-paid-2", "alice", "a2", 500),
        payment("b-paid", "bob", "b2", 700),
      ],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].membershipId).toBe("b2");
    expect(result.totalsByCurrency.EGP).toEqual({
      count: 1,
      amount: 700,
    });
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].membershipId).toBe("a2");
  });

  it("rejects non-finite and negative amounts", () => {
    const result = calculatePaidMembershipRenewals(
      [membership("m1", "u1", 7), membership("m2", "u1", 8)],
      [
        payment("nan", "u1", "m2", Number.NaN),
        payment("inf", "u1", "m2", Infinity),
        payment("negative", "u1", "m2", -50),
      ],
    );

    expect(result.rows).toHaveLength(0);
    expect(result.anomalies).toHaveLength(0);
  });
});