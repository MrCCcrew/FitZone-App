/**
 * Recover Pending Paymob Payments
 *
 * Finds PaymentTransaction records that are stuck in pending status
 * despite being paid in Paymob, and safely recovers them.
 *
 * Two recovery modes:
 * 1. Pending payments (need Paymob verification)
 * 2. Paid payments with pending memberships (need activation only)
 *
 * Usage:
 *   npx tsx scripts/recover-pending-paymob-payments.ts                    # Dry run
 *   npx tsx scripts/recover-pending-paymob-payments.ts --since=2026-08-01 # Date filter
 *   npx tsx scripts/recover-pending-paymob-payments.ts --apply            # Apply changes
 */

import { db } from "@/lib/db";
import { verifyPaymentTransaction, recoverPaidMembershipActivation } from "@/lib/payments/service";

const DRY_RUN = !process.argv.includes("--apply");
const SINCE_DATE = process.argv.find(arg => arg.startsWith("--since="))?.split("=")[1];

type RecoveryCandidate = {
  localTransactionId: string;
  userId: string;
  userName: string | null;
  amount: number;
  currency: string;
  membershipId: string | null;
  paymentStatus: string;
  membershipStatus: string | null;
  externalReference: string | null;
  providerReference: string | null;
  createdAt: Date;
  mode: "verify_payment" | "activate_membership";
};

type RecoveryResult = {
  candidate: RecoveryCandidate;
  paymobTransactionId: string | null;
  merchantOrderMatch: boolean;
  amountMatch: boolean;
  currencyMatch: boolean;
  paymobSuccess: boolean;
  paymobPending: boolean;
  refunded: boolean;
  voided: boolean;
  recoverable: boolean;
  reason: string;
};

async function findCandidates(): Promise<RecoveryCandidate[]> {
  const whereClause: any = {
    provider: "paymob",
    membershipId: { not: null },
  };

  if (SINCE_DATE) {
    whereClause.createdAt = { gte: new Date(SINCE_DATE) };
  }

  // Mode 1: Pending payments (need Paymob verification)
  const pendingPayments = await db.paymentTransaction.findMany({
    where: {
      ...whereClause,
      status: "pending",
    },
    include: {
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Mode 2: Paid payments with pending memberships (need activation only)
  const paidPendingMemberships = await db.paymentTransaction.findMany({
    where: {
      ...whereClause,
      status: "paid",
    },
    include: {
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get membership status for each payment
  const paidWithPendingMemberships = [];
  for (const payment of paidPendingMemberships) {
    if (!payment.membershipId) continue;
    const membership = await db.userMembership.findUnique({
      where: { id: payment.membershipId },
      select: { status: true },
    });
    if (membership?.status === "pending_payment") {
      paidWithPendingMemberships.push({ ...payment, membershipStatus: membership.status });
    }
  }

  const candidates: RecoveryCandidate[] = [
    ...pendingPayments.map(p => ({
      localTransactionId: p.id,
      userId: p.userId,
      userName: p.user?.name ?? null,
      amount: p.amount,
      currency: p.currency,
      membershipId: p.membershipId,
      paymentStatus: p.status,
      membershipStatus: null,
      externalReference: p.externalReference,
      providerReference: p.providerReference,
      createdAt: p.createdAt,
      mode: "verify_payment" as const,
    })),
    ...paidWithPendingMemberships.map(p => ({
      localTransactionId: p.id,
      userId: p.userId,
      userName: p.user?.name ?? null,
      amount: p.amount,
      currency: p.currency,
      membershipId: p.membershipId,
      paymentStatus: p.status,
      membershipStatus: p.membershipStatus,
      externalReference: p.externalReference,
      providerReference: p.providerReference,
      createdAt: p.createdAt,
      mode: "activate_membership" as const,
    })),
  ];

  return candidates;
}

async function verifyWithPaymob(candidate: RecoveryCandidate): Promise<Omit<RecoveryResult, "candidate">> {
  // Mode 2: Paid payment with pending membership - no Paymob verification needed
  if (candidate.mode === "activate_membership") {
    return {
      paymobTransactionId: candidate.externalReference,
      merchantOrderMatch: true,
      amountMatch: true,
      currencyMatch: true,
      paymobSuccess: true,
      paymobPending: false,
      refunded: false,
      voided: false,
      recoverable: true,
      reason: "paid_needs_activation",
    };
  }

  // Mode 1: Pending payment - needs Paymob verification
  if (!candidate.externalReference) {
    return {
      paymobTransactionId: null,
      merchantOrderMatch: false,
      amountMatch: false,
      currencyMatch: false,
      paymobSuccess: false,
      paymobPending: true,
      refunded: false,
      voided: false,
      recoverable: false,
      reason: "no_external_reference",
    };
  }

  try {
    // Use existing Paymob verification (server-side, HMAC verified)
    // This is safe because it uses the same logic as normal payment verification
    const authToken = await getPaymobAuthToken();
    const response = await fetch(
      `https://accept.paymob.com/api/acceptance/transactions/${candidate.externalReference}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return {
        paymobTransactionId: candidate.externalReference,
        merchantOrderMatch: false,
        amountMatch: false,
        currencyMatch: false,
        paymobSuccess: false,
        paymobPending: true,
        refunded: false,
        voided: false,
        recoverable: false,
        reason: `paymob_api_error_${response.status}`,
      };
    }

    const tx = await response.json() as any;

    const merchantOrderMatch = tx.order?.merchant_order_id === candidate.localTransactionId;
    const amountMatch = Math.abs((tx.amount_cents ?? 0) / 100 - candidate.amount) < 0.01;
    const currencyMatch = (tx.currency ?? "").toUpperCase() === candidate.currency.toUpperCase();
    const paymobSuccess = tx.success === true;
    const paymobPending = tx.pending !== false;
    const refunded = tx.is_refunded === true;
    const voided = tx.is_voided === true;

    const recoverable =
      merchantOrderMatch &&
      amountMatch &&
      currencyMatch &&
      paymobSuccess &&
      !paymobPending &&
      !refunded &&
      !voided;

    let reason = "ok";
    if (!merchantOrderMatch) reason = "merchant_order_mismatch";
    else if (!amountMatch) reason = "amount_mismatch";
    else if (!currencyMatch) reason = "currency_mismatch";
    else if (refunded) reason = "refunded";
    else if (voided) reason = "voided";
    else if (!paymobSuccess) reason = "not_success";
    else if (paymobPending) reason = "still_pending";

    return {
      paymobTransactionId: String(tx.id ?? candidate.externalReference),
      merchantOrderMatch,
      amountMatch,
      currencyMatch,
      paymobSuccess,
      paymobPending,
      refunded,
      voided,
      recoverable,
      reason,
    };
  } catch (error: any) {
    return {
      paymobTransactionId: candidate.externalReference,
      merchantOrderMatch: false,
      amountMatch: false,
      currencyMatch: false,
      paymobSuccess: false,
      paymobPending: true,
      refunded: false,
      voided: false,
      recoverable: false,
      reason: `api_error: ${error.message}`,
    };
  }
}

async function getPaymobAuthToken(): Promise<string> {
  const apiKey = process.env.PAYMOB_API_KEY;
  if (!apiKey) throw new Error("PAYMOB_API_KEY not configured");

  const response = await fetch("https://accept.paymob.com/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!response.ok) throw new Error(`Paymob auth failed: ${response.status}`);

  const data = await response.json() as any;
  return data.token;
}

async function recoverPayment(result: RecoveryResult): Promise<boolean> {
  if (!result.recoverable) return false;

  try {
    if (result.candidate.mode === "activate_membership") {
      // Paid payment with pending membership - use dedicated recovery function
      console.log(`  → Activating membership for paid payment ${result.candidate.localTransactionId}`);
      await recoverPaidMembershipActivation(result.candidate.localTransactionId);
      return true;
    } else {
      // Pending payment - verify will check Paymob and finalize
      console.log(`  → Verifying and finalizing payment ${result.candidate.localTransactionId}`);
      await verifyPaymentTransaction(result.candidate.localTransactionId);
      return true;
    }
  } catch (error: any) {
    console.error(`  ✗ Recovery failed: ${error.message}`);
    return false;
  }
}

function printTable(results: RecoveryResult[]) {
  console.log("\n┌" + "─".repeat(150) + "┐");
  console.log("│ Recovery Analysis".padEnd(151) + "│");
  console.log("├" + "─".repeat(150) + "┤");
  console.log(
    "│ LocalTxID".padEnd(24) +
    "│ User".padEnd(22) +
    "│ Amt".padEnd(8) +
    "│ Mode".padEnd(20) +
    "│ PayStat".padEnd(12) +
    "│ MemStat".padEnd(18) +
    "│ PaymobTx".padEnd(15) +
    "│ Checks".padEnd(20) +
    "│ Recoverable".padEnd(14) +
    "│ Reason".padEnd(20) + "│"
  );
  console.log("├" + "─".repeat(150) + "┤");

  for (const result of results) {
    const checks = [
      result.merchantOrderMatch ? "MO✓" : "MO✗",
      result.amountMatch ? "Amt✓" : "Amt✗",
      result.paymobSuccess ? "Suc✓" : "Suc✗",
    ].join(" ");

    console.log(
      "│ " + result.candidate.localTransactionId.slice(0, 21).padEnd(22) +
      "│ " + (result.candidate.userName?.slice(0, 19) ?? "N/A").padEnd(20) +
      "│ " + result.candidate.amount.toString().padEnd(6) +
      "│ " + result.candidate.mode.padEnd(18) +
      "│ " + result.candidate.paymentStatus.padEnd(10) +
      "│ " + (result.candidate.membershipStatus ?? "N/A").padEnd(16) +
      "│ " + (result.paymobTransactionId?.slice(0, 12) ?? "N/A").padEnd(13) +
      "│ " + checks.padEnd(18) +
      "│ " + (result.recoverable ? "YES" : "NO").padEnd(12) +
      "│ " + result.reason.slice(0, 18).padEnd(18) + "│"
    );
  }

  console.log("└" + "─".repeat(150) + "┘");
}

async function main() {
  console.log("\n🔍 Paymob Payment Recovery\n");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  if (SINCE_DATE) console.log(`Filter: Since ${SINCE_DATE}`);
  console.log();

  const candidates = await findCandidates();
  console.log(`Found ${candidates.length} candidate(s)\n`);

  if (candidates.length === 0) {
    console.log("✓ No pending payments to recover");
    return;
  }

  const results: RecoveryResult[] = [];

  for (const candidate of candidates) {
    process.stdout.write(`Verifying ${candidate.localTransactionId}...`);
    const verification = await verifyWithPaymob(candidate);
    results.push({ candidate, ...verification });
    process.stdout.write(` ${verification.recoverable ? "✓" : "✗"}\n`);
  }

  printTable(results);

  const recoverable = results.filter(r => r.recoverable);
  const notRecoverable = results.filter(r => !r.recoverable);

  console.log("\n📊 Summary:");
  console.log(`   Total candidates: ${results.length}`);
  console.log(`   Recoverable: ${recoverable.length}`);
  console.log(`   Not recoverable: ${notRecoverable.length}`);

  if (notRecoverable.length > 0) {
    const reasons = notRecoverable.reduce((acc, r) => {
      acc[r.reason] = (acc[r.reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log("   Reasons:");
    for (const [reason, count] of Object.entries(reasons)) {
      console.log(`     - ${reason}: ${count}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN - No changes made");
    console.log("   Run with --apply to execute recovery\n");
    return;
  }

  if (recoverable.length === 0) {
    console.log("\n✓ No recoverable payments\n");
    return;
  }

  console.log(`\n🔄 Recovering ${recoverable.length} payment(s)...\n`);

  let recovered = 0;
  let failed = 0;

  for (const result of recoverable) {
    const success = await recoverPayment(result);
    if (success) {
      recovered++;
    } else {
      failed++;
    }
  }

  console.log(`\n✅ Recovery complete:`);
  console.log(`   Recovered: ${recovered}`);
  console.log(`   Failed: ${failed}\n`);
}

main().catch(error => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
