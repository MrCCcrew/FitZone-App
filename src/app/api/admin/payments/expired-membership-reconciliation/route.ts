import { NextResponse } from "next/server";
import { requireAdminFeature, requireAdminMasterAccess } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { reconcileExpiredPaymobMembership } from "@/lib/payments/expired-membership-paymob-reconciliation";
import { cleanupExpiredPendingMembership } from "@/lib/payments/pending-membership-cleanup";

async function authorizeFinanceReview() {
  const feature = await requireAdminFeature("orders");
  if ("error" in feature) return { denied: feature.error };
  const master = await requireAdminMasterAccess("payments");
  if ("error" in master) return { denied: master.error };
  return { reviewerId: feature.session.user.id };
}

/**
 * Read-only operator queue for expired, unresolved membership holds.
 * Never expose stored Paymob client secrets, provider payloads, wallet
 * details or customer PII from this reconciliation endpoint.
 */
export async function GET(req: Request) {
  const access = await authorizeFinanceReview();
  if ("denied" in access) return access.denied;

  const requestedPage = Number(new URL(req.url).searchParams.get("page") ?? 0);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 0 || requestedPage > 100000) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }

  const now = new Date();
  const where = {
    status: "pending_payment",
    pendingExpiresAt: { lte: now },
  };

  const [totalExpiredHolds, memberships] = await Promise.all([
    db.userMembership.count({ where }),
    db.userMembership.findMany({
      where,
      select: {
        id: true,
        userId: true,
        pendingExpiresAt: true,
        membership: { select: { name: true } },
      },
      orderBy: [{ pendingExpiresAt: "asc" }, { id: "asc" }],
      skip: requestedPage * 100,
      take: 100,
    }),
  ]);

  const payments = memberships.length
    ? await db.paymentTransaction.findMany({
        where: {
          membershipId: { in: memberships.map((membership) => membership.id) },
          provider: "paymob",
          purpose: "membership",
        },
        select: {
          id: true,
          membershipId: true,
          status: true,
          amount: true,
          currency: true,
          referenceCode: true,
          expiresAt: true,
          createdAt: true,
        },
      })
    : [];

  const byMembership = new Map<string, typeof payments>();
  for (const payment of payments) {
    if (!payment.membershipId) continue;
    const entries = byMembership.get(payment.membershipId) ?? [];
    entries.push(payment);
    byMembership.set(payment.membershipId, entries);
  }

  // A provider-confirmed charge after two-review release requires a
  // finance refund/compensation decision, never automatic activation.
  const markedExceptions = await db.paymentTransaction.findMany({
    where: {
      provider: "paymob",
      purpose: "membership",
      status: "cancelled",
      metadata: { contains: "paymobManualNoChargeLatePaidAt" },
    },
    select: {
      id: true,
      membershipId: true,
      userId: true,
      amount: true,
      currency: true,
      externalReference: true,
      metadata: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const financialExceptions = markedExceptions.flatMap((payment) => {
    try {
      const metadata = JSON.parse(payment.metadata || "{}") as Record<string, unknown>;
      if (typeof metadata.paymobManualNoChargeLatePaidAt !== "string") return [];
      return [{
        transactionId: payment.id,
        membershipId: payment.membershipId,
        userId: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        paymobTransactionId: payment.externalReference,
        flaggedAt: metadata.paymobManualNoChargeLatePaidAt,
        actionRequired: "verify_charge_then_refund_or_supervised_entitlement_correction",
      }];
    } catch {
      return [];
    }
  });

  return NextResponse.json({
    page: requestedPage,
    pageSize: 100,
    totalExpiredHolds,
    financialExceptions,
    hasMore: (requestedPage + 1) * 100 < totalExpiredHolds,
    requiresFinancialReview: true,
    items: memberships
      .filter((membership) => byMembership.has(membership.id))
      .map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        planName: membership.membership.name,
        originalHoldExpiredAt: membership.pendingExpiresAt,
        payments: byMembership.get(membership.id),
        resolution: "requires_provider_finality_or_manual_finance_review",
      })),
  });
}

/**
 * Safe operator action: check for positive payment and repair an already
 * paid membership. No endpoint can force-paid a Paymob transaction.
 * Negative payment finality requires TWO independent finance reviews.
 */
export async function POST(req: Request) {
  const access = await authorizeFinanceReview();
  if ("denied" in access) return access.denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const membershipId = input.membershipId;
  if (
    !["recheck", "approve-no-charge"].includes(String(input.action)) ||
    typeof membershipId !== "string" ||
    membershipId.trim().length < 5 ||
    membershipId.length > 128
  ) {
    return NextResponse.json({ error: "Invalid reconciliation request" }, { status: 400 });
  }

  const membership = await db.userMembership.findUnique({
    where: { id: membershipId },
    select: { status: true, pendingExpiresAt: true },
  });
  if (
    !membership ||
    membership.status !== "pending_payment" ||
    !membership.pendingExpiresAt ||
    membership.pendingExpiresAt > new Date()
  ) {
    return NextResponse.json({ error: "No expired pending membership" }, { status: 409 });
  }

  if (input.action === "approve-no-charge") {
    // This action must be based on a complete Paymob transaction report,
    // not the last-attempt inquiry. It is deliberately unavailable within
    // the original hold or while an active renewal claim exists.
    if (
      membership.pendingExpiresAt.getTime() + 20 * 60_000 > Date.now() ||
      input.attestation !== "I_CHECKED_ALL_PAYMOB_ATTEMPTS_UNPAID" ||
      typeof input.reportReference !== "string" ||
      input.reportReference.trim().length < 8 ||
      input.reportReference.length > 150 ||
      typeof input.reviewNote !== "string" ||
      input.reviewNote.trim().length < 20 ||
      input.reviewNote.length > 800
    ) {
      return NextResponse.json(
        { error: "Finance report, full-attempt attestation and minimum 20-minute grace required" },
        { status: 400 },
      );
    }

    const payments = await db.paymentTransaction.findMany({
      where: {
        membershipId,
        provider: "paymob",
        purpose: "membership",
      },
      select: {
        id: true,
        status: true,
        metadata: true,
        providerPayload: true,
        externalReference: true,
      },
      take: 2,
    });

    if (
      payments.length !== 1 ||
      ["paid", "retrying", "processing", "pending_payment"].includes(payments[0].status)
    ) {
      return NextResponse.json({ error: "Ambiguous or active Paymob attempt" }, { status: 409 });
    }

    // Positive payment always wins over manual no-charge review.
    try {
      const providerState = await reconcileExpiredPaymobMembership(membershipId);
      if (providerState.kind !== "unresolved") {
        return NextResponse.json(
          { outcome: providerState.kind, manualReleaseBlocked: true },
          { status: 409 },
        );
      }
    } catch (error) {
      console.warn("[PAYMOB_MANUAL_FINALITY_PROVIDER_RECHECK_UNAVAILABLE]", {
        membershipId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return NextResponse.json({ error: "Provider recheck unavailable" }, { status: 503 });
    }

    const payment = payments[0];
    let metadata: Record<string, unknown> = {};
    try {
      const raw: unknown = JSON.parse(payment.metadata || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Invalid metadata");
      }
      metadata = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid payment metadata" }, { status: 409 });
    }

    const rawReview = metadata.paymobNoChargeReview;
    const previous = rawReview && typeof rawReview === "object" && !Array.isArray(rawReview)
      ? rawReview as Record<string, unknown>
      : null;
    const approvals = previous && Array.isArray(previous.approvals)
      ? previous.approvals as Array<Record<string, unknown>>
      : [];

    if (
      previous?.settledAt ||
      approvals.length >= 2 ||
      approvals.some((approval) => approval.reviewerId === access.reviewerId) ||
      (previous && previous.reportReference !== input.reportReference.trim())
    ) {
      return NextResponse.json(
        { error: "A distinct second reviewer must verify the SAME Paymob report" },
        { status: 409 },
      );
    }

    const nextReview = {
      reportReference: input.reportReference.trim(),
      approvals: [
        ...approvals,
        {
          reviewerId: access.reviewerId,
          reviewedAt: new Date().toISOString(),
          reviewNote: input.reviewNote.trim(),
        },
      ],
    };

    const claimed = await db.paymentTransaction.updateMany({
      where: {
        id: payment.id,
        status: payment.status,
        metadata: payment.metadata,
        providerPayload: payment.providerPayload,
        externalReference: payment.externalReference,
      },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          paymobNoChargeReview: nextReview,
        }),
      },
    });

    if (claimed.count !== 1) {
      return NextResponse.json({ error: "Review state changed; retry safely" }, { status: 409 });
    }

    if (nextReview.approvals.length < 2) {
      return NextResponse.json({
        outcome: "awaiting_independent_second_review",
        approvalsCount: 1,
      });
    }

    try {
      const result = await cleanupExpiredPendingMembership(membershipId);
      return NextResponse.json({
        outcome: result.cleaned ? "released_after_two_finance_reviews" : "not_released",
        approvalsCount: 2,
        released: result.cleaned,
        ...(result.cleaned ? {} : { reason: result.reason }),
      }, { status: result.cleaned ? 200 : 409 });
    } catch (error) {
      console.error("[PAYMOB_MANUAL_NO_CHARGE_SETTLEMENT_FAILED]", {
        membershipId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return NextResponse.json({ error: "Settlement failed; no release confirmed" }, { status: 503 });
    }
  }

  try {
    const reconciliation = await reconcileExpiredPaymobMembership(membershipId);
    return NextResponse.json({
      membershipId,
      outcome: reconciliation.kind,
      requiresManualFinalityReview: reconciliation.kind === "unresolved",
    });
  } catch (error) {
    console.error("[ADMIN_PAYMOB_EXPIRED_RECHECK]", {
      membershipId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Provider reconciliation unavailable. No payment data changed." },
      { status: 503 },
    );
  }
}
