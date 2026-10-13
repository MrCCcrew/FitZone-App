import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

/**
 * Read-only, paginated wallet-topup audit. Financial source of truth:
 * paid PaymentTransaction rows. Current wallet balance and the presence
 * of a posted GL journal do NOT prove the exact historical credit entry,
 * because WalletTransaction has no paymentTransactionId foreign key yet.
 */
export async function GET(request: Request) {
  const guard = await requireAdminFeature("accounting");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const rawPage = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isSafeInteger(rawPage) ? Math.max(1, Math.min(100000, rawPage)) : 1;
  const status = url.searchParams.get("status") ?? "all";
  const statuses = ["all", "paid", "pending", "processing", "requires_action", "failed", "expired", "cancelled"];
  if (!statuses.includes(status)) {
    return NextResponse.json({ error: "حالة الشحن غير صالحة." }, { status: 400 });
  }
  const pageSize = 50;
  const where = {
    purpose: "wallet_topup",
    ...(status === "all" ? {} : { status }),
  };

  const [transactions, count] = await db.$transaction([
    db.paymentTransaction.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: {
        id: true,
        userId: true,
        status: true,
        amount: true,
        currency: true,
        provider: true,
        referenceCode: true,
        providerReference: true,
        externalReference: true,
        createdAt: true,
        paidAt: true,
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            wallet: { select: { balance: true } },
          },
        },
      },
    }),
    db.paymentTransaction.count({ where }),
  ], {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  const transactionIds = transactions.map((t) => t.id);
  const journals = transactionIds.length
    ? await db.journal.findMany({
        where: {
          referenceType: "WalletTopup",
          referenceId: { in: transactionIds },
        },
        select: { referenceId: true, status: true },
      })
    : [];
  const journalStatusByPayment = new Map(
    journals.map((entry) => [entry.referenceId, entry.status]),
  );

  // Historical wallet movements use source="legacy"; newer ones use
  // "topup" / "topup_bonus". Match by same customer, exact reference suffix,
  // settlement-day proximity and amount. This is evidence, not authority to
  // change the wallet or claim a complete formal reconciliation.
  const paidTransactions = transactions.filter(
    (transaction) => transaction.status === "paid",
  );

  // Fetch matching credit candidates once for the entire page.
  // Each OR branch keeps the customer's identity, exact reference
  // substring and original 72-hour evidence window.
  const candidates = paidTransactions.length
    ? await db.walletTransaction.findMany({
        where: {
          type: "credit",
          source: { in: ["legacy", "topup", "topup_bonus"] },
          OR: paidTransactions.map((transaction) => {
            const settledAt = transaction.paidAt ?? transaction.createdAt;
            return {
              wallet: { userId: transaction.userId },
              description: {
                contains: transaction.referenceCode ?? transaction.id,
              },
              createdAt: {
                gte: new Date(settledAt.getTime() - 72 * 3600000),
                lte: new Date(settledAt.getTime() + 72 * 3600000),
              },
            };
          }),
        },
        select: {
          amount: true,
          source: true,
          description: true,
          createdAt: true,
          wallet: { select: { userId: true } },
        },
      })
    : [];

  const creditEvidence = transactions.map((transaction) => {
    if (transaction.status !== "paid") {
      return {
        principal: "not_paid" as const,
        extraCredit: 0,
        extraCreditCount: 0,
      };
    }

    const reference = transaction.referenceCode ?? transaction.id;
    const settledAt = transaction.paidAt ?? transaction.createdAt;
    const from = settledAt.getTime() - 72 * 3600000;
    const until = settledAt.getTime() + 72 * 3600000;

    const exact = candidates.filter((movement) =>
      movement.wallet.userId === transaction.userId &&
      movement.createdAt.getTime() >= from &&
      movement.createdAt.getTime() <= until &&
      typeof movement.description === "string" &&
      movement.description.trim().endsWith(reference),
    );

    const principal = exact.filter((movement) =>
      Math.abs(Number(movement.amount) - Number(transaction.amount)) < 0.005 &&
      (movement.source === "legacy" || movement.source === "topup"),
    );

    const additional = exact.filter(
      (movement) => !principal.includes(movement),
    );

    return {
      principal: principal.length === 1
        ? "unique_reference_amount_match" as const
        : principal.length > 1
          ? "ambiguous_duplicate" as const
          : "no_match" as const,
      extraCredit: Math.round(
        additional.reduce(
          (total, movement) => total + Number(movement.amount), 0,
        ) * 100,
      ) / 100,
      extraCreditCount: additional.length,
    };
  });

  return NextResponse.json({
    rows: transactions.map((transaction, index) => ({
      id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      provider: transaction.provider,
      reference: transaction.referenceCode ??
        transaction.providerReference ??
        transaction.externalReference ?? transaction.id,
      createdAt: transaction.createdAt.toISOString(),
      paidAt: transaction.paidAt?.toISOString() ?? null,
      customerName: transaction.user.name ?? "—",
      customerEmail: transaction.user.email ?? null,
      customerPhone: transaction.user.phone ?? null,
      currentWalletBalance: transaction.user.wallet?.balance ?? null,
      journalStatus: journalStatusByPayment.get(transaction.id) ?? "missing",
      principalCreditEvidence: creditEvidence[index].principal,
      additionalReferencedCreditCandidate: creditEvidence[index].extraCredit,
      additionalReferencedCreditCount: creditEvidence[index].extraCreditCount,
      // Not a settlement verdict: no direct payment-to-wallet-credit FK.
      walletCreditReconciled: false,
    })),
    page,
    total: count,
    totalPages: Math.ceil(count / pageSize),
    pageSize,
    dateBasis: "createdAt",
    creditReconciliationStatus: "requires_direct_payment_transaction_link",
  });
}
