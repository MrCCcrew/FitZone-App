import { NextResponse } from "next/server";
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

  const [transactions, count] = await Promise.all([
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
  ]);

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

  return NextResponse.json({
    rows: transactions.map((transaction) => ({
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
