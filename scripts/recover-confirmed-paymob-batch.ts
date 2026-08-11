/**
 * Production Historical Recovery: 7 Confirmed Paymob Payments
 *
 * STRICT SCOPE: Only these 7 payments, no others.
 * Verifies each independently with Paymob API before recovery.
 *
 * Usage:
 *   npx tsx scripts/recover-confirmed-paymob-batch.ts           # Dry run
 *   npx tsx scripts/recover-confirmed-paymob-batch.ts --apply   # Apply recovery
 */

import { db } from "@/lib/db";
import { verifyPaymobTransactionForRecovery } from "@/lib/payments/providers/paymob";
import { recoverPaidMembershipActivation } from "@/lib/payments/recovery-service";

const DRY_RUN = !process.argv.includes("--apply");

const CONFIRMED_PAYMENTS = [
  { localId: "cmsp0itbd000dl1os2t883q9z", paymobId: "513681133", amount: 50 },
  { localId: "cmsp05509000nl1c1mh1rd9j9", paymobId: "513671293", amount: 50 },
  { localId: "cmsoy3rlz00tml1pxneqbrcc8", paymobId: "513631364", amount: 666 },
  { localId: "cmsoy5fs600u4l1pxs9hyr752", paymobId: "513629861", amount: 50 },
  { localId: "cmsox5fzf00q1lpxvqsl35lz", paymobId: "513609892", amount: 50 },
  { localId: "cmsosg5sr00a8l1pxnqyv8gh4", paymobId: "513525213", amount: 666 },
  { localId: "cmsojt3is006il1pxih3v1n6m", paymobId: "513388921", amount: 666 },
] as const;

const EXPECTED_CURRENCY = "EGP";

type VerificationResult = {
  localId: string;
  paymobId: string;
  verified: boolean;
  currentPaymentStatus: string;
  membershipStatus: string | null;
  action: string;
  failureReason?: string;
};

async function verifyPayment(
  localId: string,
  paymobId: string,
  expectedAmount: number,
): Promise<VerificationResult> {
  try {
    // Load local payment
    const payment = await db.paymentTransaction.findUnique({
      where: { id: localId },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        membershipId: true,
        paidAt: true,
        externalReference: true,
      },
    });

    if (!payment) {
      return {
        localId,
        paymobId,
        verified: false,
        currentPaymentStatus: "NOT_FOUND",
        membershipStatus: null,
        action: "SKIP",
        failureReason: "Payment not found in database",
      };
    }

    // Check membership
    let membershipStatus: string | null = null;
    if (payment.membershipId) {
      const membership = await db.userMembership.findUnique({
        where: { id: payment.membershipId },
        select: { status: true },
      });
      membershipStatus = membership?.status ?? "NOT_FOUND";
    }

    // Already recovered
    if (payment.status === "paid" && membershipStatus === "active") {
      return {
        localId,
        paymobId,
        verified: true,
        currentPaymentStatus: payment.status,
        membershipStatus,
        action: "ALREADY_RECOVERED",
      };
    }

    // Verify with Paymob
    const verification = await verifyPaymobTransactionForRecovery(
      paymobId,
      localId,
      expectedAmount,
      EXPECTED_CURRENCY,
      localId, // expectedFitZoneReference
    );

    if (!verification.verified) {
      return {
        localId,
        paymobId,
        verified: false,
        currentPaymentStatus: payment.status,
        membershipStatus,
        action: "SKIP",
        failureReason: verification.failureReason || "Paymob verification failed",
      };
    }

    // Determine action
    let action = "RECOVER";
    if (payment.status === "paid" && membershipStatus === "pending_payment") {
      action = "ACTIVATE_MEMBERSHIP";
    } else if (payment.status === "paid" && membershipStatus !== "active") {
      action = "RECHECK_MEMBERSHIP";
    }

    return {
      localId,
      paymobId,
      verified: true,
      currentPaymentStatus: payment.status,
      membershipStatus,
      action,
    };
  } catch (error: any) {
    return {
      localId,
      paymobId,
      verified: false,
      currentPaymentStatus: "ERROR",
      membershipStatus: null,
      action: "SKIP",
      failureReason: error.message,
    };
  }
}

async function recoverPayment(localId: string, paymobId: string): Promise<boolean> {
  try {
    const payment = await db.paymentTransaction.findUnique({
      where: { id: localId },
      select: { status: true, membershipId: true },
    });

    if (!payment) {
      console.error(`   [${localId}] Payment not found`);
      return false;
    }

    // Update payment status if needed
    if (payment.status !== "paid") {
      await db.paymentTransaction.update({
        where: { id: localId },
        data: {
          status: "paid",
          paidAt: new Date(),
          externalReference: paymobId,
        },
      });
    }

    // Activate membership if exists
    if (payment.membershipId) {
      await recoverPaidMembershipActivation(localId);
    }

    return true;
  } catch (error: any) {
    console.error(`   [${localId}] Recovery failed: ${error.message}`);
    return false;
  }
}

function printTable(results: VerificationResult[]) {
  const header = "LocalPaymentId".padEnd(28) + " | " +
    "PaymobTxId".padEnd(12) + " | " +
    "Verified".padEnd(8) + " | " +
    "PaymentStatus".padEnd(15) + " | " +
    "MembershipStatus".padEnd(18) + " | " +
    "Action".padEnd(20);

  const separator = "─".repeat(header.length);

  console.log();
  console.log(separator);
  console.log(header);
  console.log(separator);

  for (const result of results) {
    const row = result.localId.padEnd(28) + " | " +
      result.paymobId.padEnd(12) + " | " +
      (result.verified ? "YES" : "NO").padEnd(8) + " | " +
      result.currentPaymentStatus.padEnd(15) + " | " +
      (result.membershipStatus ?? "N/A").padEnd(18) + " | " +
      result.action.padEnd(20);
    console.log(row);
    if (result.failureReason) {
      console.log("   └─ Reason: " + result.failureReason);
    }
  }

  console.log(separator);
}

async function main() {
  console.log("\n🔍 Historical Paymob Batch Recovery");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Payments: ${CONFIRMED_PAYMENTS.length}`);

  // Phase 1: Verify all payments
  console.log("\n📋 Phase 1: Verifying with Paymob API...");
  const results: VerificationResult[] = [];

  for (const payment of CONFIRMED_PAYMENTS) {
    process.stdout.write(`   [${payment.localId.slice(0, 8)}...] Verifying... `);
    const result = await verifyPayment(payment.localId, payment.paymobId, payment.amount);
    results.push(result);
    console.log(result.verified ? "✓" : "✗");
  }

  // Print summary table
  printTable(results);

  const verified = results.filter((r) => r.verified && r.action !== "ALREADY_RECOVERED");
  const alreadyRecovered = results.filter((r) => r.action === "ALREADY_RECOVERED");
  const failed = results.filter((r) => !r.verified);

  console.log("\n📊 Summary:");
  console.log(`   Total: ${results.length}`);
  console.log(`   Verified: ${verified.length}`);
  console.log(`   Already Recovered: ${alreadyRecovered.length}`);
  console.log(`   Failed Verification: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\n⚠️  Failed Verifications:");
    for (const result of failed) {
      console.log(`   - ${result.localId}: ${result.failureReason}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN - No changes made");
    console.log("   Run with --apply to execute recovery\n");
    return;
  }

  if (verified.length === 0) {
    console.log("\n✓ No payments need recovery\n");
    return;
  }

  // Phase 2: Recover verified payments
  console.log(`\n🔄 Phase 2: Recovering ${verified.length} verified payment(s)...`);
  let recovered = 0;
  let recoveryFailed = 0;

  for (const result of verified) {
    process.stdout.write(`   [${result.localId.slice(0, 8)}...] Recovering... `);
    const success = await recoverPayment(result.localId, result.paymobId);
    if (success) {
      recovered++;
      console.log("✓");
    } else {
      recoveryFailed++;
      console.log("✗");
    }
  }

  console.log("\n✅ Recovery Complete:");
  console.log(`   Recovered: ${recovered}`);
  console.log(`   Failed: ${recoveryFailed}`);
  console.log();
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
