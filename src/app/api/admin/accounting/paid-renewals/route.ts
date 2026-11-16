import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { calculatePaidMembershipRenewals } from "@/lib/reports/paid-membership-renewals";

const MAX_MEMBERSHIPS = 20000;
const MAX_PAYMENTS = 20000;
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const guard = await requireAdminFeature("accounting");
  if ("error" in guard) return guard.error;

  try {
    // Include the complete activated subscription history, not only the
    // period being reported: the first historical subscription is not renewal.
    const memberships = await db.userMembership.findMany({
      where: {
        activatedAt: { not: null },
        membership: { kind: "subscription" },
      },
      select: {
        id: true,
        userId: true,
        activatedAt: true,
        paymentAmount: true,
        status: true,
        membership: {
          select: { name: true, kind: true },
        },
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      take: MAX_MEMBERSHIPS + 1,
    });

    if (memberships.length > MAX_MEMBERSHIPS) {
      return NextResponse.json(
        { error: "REPORT_SIZE_LIMIT_MEMBERSHIPS" },
        { status: 422, headers },
      );
    }

    const membershipIds = memberships.map((row) => row.id);

    const payments = membershipIds.length
      ? await db.paymentTransaction.findMany({
          where: {
            membershipId: { in: membershipIds },
            purpose: "membership",
            status: "paid",
            paidAt: { not: null },
          },
          select: {
            id: true,
            userId: true,
            membershipId: true,
            purpose: true,
            status: true,
            amount: true,
            currency: true,
            provider: true,
            paidAt: true,
          },
          take: MAX_PAYMENTS + 1,
        })
      : [];

    if (payments.length > MAX_PAYMENTS) {
      return NextResponse.json(
        { error: "REPORT_SIZE_LIMIT_PAYMENTS" },
        { status: 422, headers },
      );
    }

    // Match the existing customer statement's financial evidence rules.
    // A disputed payment excludes the entire renewal, not just one attempt.
    const membershipById = new Map(
      memberships.map((membership) => [membership.id, membership]),
    );

    const rejected = new Map<string, {
      membershipId: string;
      reason: string;
      paymentIds: string[];
    }>();

    for (const payment of payments) {
      if (!payment.membershipId) continue;

      const membership = membershipById.get(payment.membershipId);
      if (!membership || payment.userId !== membership.userId) continue;

      const expected = Number(membership.paymentAmount);
      const matches = Number.isFinite(expected) &&
        expected > 0 &&
        Number.isFinite(payment.amount) &&
        Math.abs(payment.amount - expected) < 0.000001;

      const reason = !matches
        ? "PAYMENT_AMOUNT_MISMATCH"
        : !["active", "expired"].includes(membership.status)
          ? "MEMBERSHIP_STATUS_REVIEW"
          : null;

      if (!reason) continue;

      const existing = rejected.get(membership.id);
      if (existing) {
        existing.paymentIds.push(payment.id);
      } else {
        rejected.set(membership.id, {
          membershipId: membership.id,
          reason,
          paymentIds: [payment.id],
        });
      }
    }

    const eligiblePayments = payments.filter(
      (payment) =>
        payment.membershipId &&
        !rejected.has(payment.membershipId) &&
        payment.userId !== null,
    );

    const result = calculatePaidMembershipRenewals(
      memberships.map((row) => ({
        id: row.id,
        userId: row.userId,
        planName: row.membership.name,
        kind: row.membership.kind,
        activatedAt: row.activatedAt,
      })),
      eligiblePayments.flatMap((payment) =>
        payment.userId === null ? [] : [{ ...payment, userId: payment.userId }],
      ),
    );

    const customers = new Map(
      memberships.map((row) => [row.userId, row.user]),
    );

    return NextResponse.json(
      {
        rows: result.rows.map((row) => ({
          ...row,
          customerName: customers.get(row.userId)?.name ?? null,
          customerEmail: customers.get(row.userId)?.email ?? null,
          customerPhone: customers.get(row.userId)?.phone ?? null,
        })),
        anomalies: [...result.anomalies, ...rejected.values()],
        totalsByCurrency: result.totalsByCurrency,
        count: result.rows.length,
        evidenceLevel: "local_paid_transaction",
        reconciliationRequired:
          result.anomalies.length > 0 || rejected.size > 0,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "PAID_RENEWALS_REPORT_FAILED" },
      { status: 500, headers },
    );
  }
}