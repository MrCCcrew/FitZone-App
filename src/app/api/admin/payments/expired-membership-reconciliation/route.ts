import { NextResponse } from "next/server";
import { requireAdminFeature, requireAdminMasterAccess } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { reconcileExpiredPaymobMembership } from "@/lib/payments/expired-membership-paymob-reconciliation";

async function authorizeFinanceReview() {
  const feature = await requireAdminFeature("orders");
  if ("error" in feature) return feature.error;
  const master = await requireAdminMasterAccess("payments");
  if ("error" in master) return master.error;
  return null;
}

/**
 * Read-only operator queue for expired, unresolved membership holds.
 * Never expose stored Paymob client secrets, provider payloads, wallet
 * details or customer PII from this reconciliation endpoint.
 */
export async function GET(req: Request) {
  const denied = await authorizeFinanceReview();
  if (denied) return denied;

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

  return NextResponse.json({
    page: requestedPage,
    pageSize: 100,
    totalExpiredHolds,
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
 * paid membership. There is intentionally NO manual force-paid, refund,
 * no-charge declaration or automatic seat release through this API.
 */
export async function POST(req: Request) {
  const denied = await authorizeFinanceReview();
  if (denied) return denied;

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
    input.action !== "recheck" ||
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
