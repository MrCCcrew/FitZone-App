import { describe, expect, it } from "vitest";
import {
  calculatePaidMembershipRenewals,
  type RenewalMembership,
  type RenewalPayment,
} from "@/lib/reports/paid-membership-renewals";

const date = (value: string) => new Date(value);

const first: RenewalMembership = {
  id: "m1",
  userId: "u1",
  planName: "Monthly",
  kind: "subscription",
  activatedAt: date("2026-09-01T10:00:00Z"),
};

const renewal: RenewalMembership = {
  id: "m2",
  userId: "u1",
  planName: "Monthly Plus",
  kind: "subscription",
  activatedAt: date("2026-10-01T10:00:00Z"),
};

const paid: RenewalPayment = {
  id: "p2",
  userId: "u1",
  membershipId: "m2",
  purpose: "membership",
  status: "paid",
  amount: 900,
  currency: "EGP",
  provider: "paymob",
  paidAt: date("2026-10-01T10:05:00Z"),
};

const calculate = (
  memberships: RenewalMembership[] = [first, renewal],
  payments: RenewalPayment[] = [paid],
) => calculatePaidMembershipRenewals(memberships, payments);

describe("R19 paid subscription renewal financial truth", () => {
  it("counts a genuinely activated, paid renewal once", () => {
    const result = calculate();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      membershipId: "m2",
      previousMembershipId: "m1",
      paymentId: "p2",
      amount: 900,
    });
    expect(result.totalsByCurrency.EGP).toEqual({
      count: 1,
      amount: 900,
    });
  });

  it("does not count an initial subscription as renewal", () => {
    expect(calculate([first], [paid]).rows).toHaveLength(0);
  });

  it("excludes pending and failed payment attempts", () => {
    expect(calculate(undefined, [
      { ...paid, status: "pending" },
      { ...paid, id: "p3", status: "failed" },
    ]).rows).toHaveLength(0);
  });

  it("excludes payments with no paidAt", () => {
    expect(calculate(undefined, [
      { ...paid, paidAt: null },
    ]).rows).toHaveLength(0);
  });

  it("does not count quoted amounts without successful payment", () => {
    expect(calculate(undefined, []).rows).toHaveLength(0);
  });

  it("excludes independent packages", () => {
    expect(calculate([
      first,
      { ...renewal, kind: "package" },
    ]).rows).toHaveLength(0);
  });

  it("does not allow one customer to use another customer's payment", () => {
    expect(calculate(undefined, [
      { ...paid, userId: "u2" },
    ]).rows).toHaveLength(0);
  });

  it("excludes unpaid or unactivated replacement memberships", () => {
    expect(calculate([
      first,
      { ...renewal, activatedAt: null },
    ]).rows).toHaveLength(0);
  });

  it("flags multiple paid transactions without double counting", () => {
    const result = calculate(undefined, [
      paid,
      { ...paid, id: "p3" },
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.anomalies).toEqual([{
      membershipId: "m2",
      reason: "MULTIPLE_PAID_TRANSACTIONS",
      paymentIds: ["p2", "p3"],
    }]);
  });

  it("excludes zero-value and non-membership transactions", () => {
    expect(calculate(undefined, [
      { ...paid, amount: 0 },
      { ...paid, id: "p3", purpose: "order" },
    ]).rows).toHaveLength(0);
  });

  it("does not confuse another customer's prior membership with renewal", () => {
    expect(calculate([
      { ...first, userId: "u2" },
      renewal,
    ]).rows).toHaveLength(0);
  });

  it("does not require carryover to identify genuine renewal", () => {
    expect(calculate().rows).toHaveLength(1);
  });
});