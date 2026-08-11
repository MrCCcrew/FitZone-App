/**
 * Historical Recovery: Single Paymob Payment 513615625
 *
 * Local transaction: cmsow7ug800phl1pxq49hba4t
 * Paymob transaction: 513615625
 * Expected amount: 388 EGP (38800 cents)
 *
 * Verification:
 * - Uses existing verifyPaymobTransactionForRecovery
 * - Checks merchant_order_id, amount, success, pending, voided, refunded
 * - Only recovers if ALL checks pass
 *
 * Usage:
 *   npx tsx scripts/recover-single-paymob-513615625.ts           # Dry run
 *   npx tsx scripts/recover-single-paymob-513615625.ts --apply   # Apply recovery
 */

import { db } from "@/lib/db";
import { verifyPaymobTransactionForRecovery } from "@/lib/payments/providers/paymob";
import { recoverPaidMembershipActivation } from "@/lib/payments/recovery-service";

const DRY_RUN = !process.argv.includes("--apply");
const LOCAL_TRANSACTION_ID = "cmsow7ug800phl1pxq49hba4t";
const PAYMOB_TRANSACTION_ID = "513615625";
const EXPECTED_AMOUNT = 388; // EGP
const EXPECTED_CURRENCY = "EGP";

async function main() {
  console.log("\n🔍 Historical Paymob Payment Recovery");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Local Transaction: ${LOCAL_TRANSACTION_ID}`);
  console.log(`Paymob Transaction: ${PAYMOB_TRANSACTION_ID}`);
  console.log();

  // 1. Load local payment transaction
  const payment = await db.paymentTransaction.findUnique({
    where: { id: LOCAL_TRANSACTION_ID },
    include: {
      user: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!payment) {
    console.error("❌ Local transaction not found");
    process.exit(1);
  }

  console.log("📋 Local Payment Details:");
  console.log(`   User: ${payment.user?.name} (${payment.user?.phone})`);
  console.log(`   Status: ${payment.status}`);
  console.log(`   Amount: ${payment.amount} ${payment.currency}`);
  console.log(`   Provider: ${payment.provider}`);
  console.log(`   Membership ID: ${payment.membershipId ?? "N/A"}`);
  console.log(`   Created: ${payment.createdAt.toISOString()}`);
  console.log();

  // 2. Check if payment is already recovered
  if (payment.status === "paid") {
    console.log("✓ Payment already marked as paid");
    if (!payment.membershipId) {
      console.log("⚠️  No linked membership - nothing to recover");
      return;
    }
    const membership = await db.userMembership.findUnique({
      where: { id: payment.membershipId },
      select: { status: true },
    });
    if (membership?.status === "active") {
      console.log("✓ Membership already active - recovery complete");
      return;
    }
    console.log(`⚠️  Membership status: ${membership?.status ?? "NOT FOUND"}`);
    console.log("   Will attempt to activate membership only");
  }

  // 3. Verify with Paymob
  console.log("🔐 Verifying with Paymob API...");
  const verification = await verifyPaymobTransactionForRecovery(
    PAYMOB_TRANSACTION_ID,
    LOCAL_TRANSACTION_ID,
    EXPECTED_AMOUNT,
    EXPECTED_CURRENCY,
    LOCAL_TRANSACTION_ID, // expectedFitZoneReference
  );

  console.log("\n📊 Paymob Verification Result:");
  console.log(`   Verified: ${verification.verified ? "✅" : "❌"}`);
  console.log(`   Success: ${verification.success}`);
  console.log(`   Pending: ${verification.pending}`);
  console.log(`   Amount: ${verification.amountCents / 100} ${verification.currency}`);
  console.log(`   Paymob Order ID: ${verification.paymobOrderId ?? "N/A"}`);
  console.log(`   Special Reference: ${verification.specialReference ?? "N/A"}`);
  console.log(`   Source Type: ${verification.sourceType ?? "N/A"}`);
  console.log(`   Refunded: ${verification.isRefunded}`);
  console.log(`   Voided: ${verification.isVoided}`);
  console.log(`   Error: ${verification.errorOccured}`);
  if (verification.failureReason) {
    console.log(`   Failure Reason: ${verification.failureReason}`);
  }
  console.log();

  if (!verification.verified) {
    console.error("❌ Verification failed - cannot recover");
    console.error("   Reason: " + (verification.failureReason || "Unknown"));
    process.exit(1);
  }

  console.log("✅ Verification passed - payment is legitimate");
  console.log();

  // 4. Check membership status
  if (!payment.membershipId) {
    console.error("❌ No linked membership - cannot recover");
    process.exit(1);
  }

  const membership = await db.userMembership.findUnique({
    where: { id: payment.membershipId },
    select: {
      status: true,
      membership: { select: { name: true } },
      startDate: true,
      endDate: true,
    },
  });

  if (!membership) {
    console.error("❌ Linked membership not found");
    process.exit(1);
  }

  console.log("📋 Linked Membership:");
  console.log(`   Plan: ${membership.membership?.name ?? "Unknown"}`);
  console.log(`   Status: ${membership.status}`);
  console.log(`   Start: ${membership.startDate?.toISOString() ?? "N/A"}`);
  console.log(`   End: ${membership.endDate?.toISOString() ?? "N/A"}`);
  console.log();

  if (membership.status === "active") {
    console.log("✓ Membership already active - no action needed");
    return;
  }

  if (membership.status !== "pending_payment") {
    console.error(`❌ Membership status is "${membership.status}" - expected "pending_payment"`);
    console.error("   Cannot safely recover");
    process.exit(1);
  }

  // 5. Recovery decision
  console.log("🎯 Recovery Plan:");
  if (payment.status !== "paid") {
    console.log("   1. Update PaymentTransaction.status = 'paid'");
    console.log(`   2. Set PaymentTransaction.externalReference = '${PAYMOB_TRANSACTION_ID}'`);
    console.log("   3. Set PaymentTransaction.paidAt = now");
  }
  console.log("   4. Activate membership (status = 'active')");
  console.log("   5. Run post-activation reconciliation");
  console.log("      - Commissions");
  console.log("      - Wallet bonus");
  console.log("      - Reward points");
  console.log("      - Notifications");
  console.log("      - Email confirmation");
  console.log();

  if (DRY_RUN) {
    console.log("⚠️  DRY RUN - No changes made");
    console.log("   Run with --apply to execute recovery");
    console.log();
    return;
  }

  // 6. Execute recovery
  console.log("🔄 Executing recovery...");
  console.log();

  try {
    // Update payment status if needed
    if (payment.status !== "paid") {
      await db.paymentTransaction.update({
        where: { id: LOCAL_TRANSACTION_ID },
        data: {
          status: "paid",
          paidAt: new Date(),
          externalReference: PAYMOB_TRANSACTION_ID,
        },
      });
      console.log("✓ Payment marked as paid");
    }

    // Activate membership using existing recovery logic
    const result = await recoverPaidMembershipActivation(LOCAL_TRANSACTION_ID);
    console.log("✓ Membership activated successfully");
    console.log();

    // Verify final state
    const finalPayment = await db.paymentTransaction.findUnique({
      where: { id: LOCAL_TRANSACTION_ID },
      select: { status: true, paidAt: true, externalReference: true },
    });

    const finalMembership = await db.userMembership.findUnique({
      where: { id: payment.membershipId! },
      select: { status: true, startDate: true, endDate: true },
    });

    console.log("📊 Final State:");
    console.log(`   Payment Status: ${finalPayment?.status}`);
    console.log(`   Payment External Ref: ${finalPayment?.externalReference}`);
    console.log(`   Payment Paid At: ${finalPayment?.paidAt?.toISOString()}`);
    console.log(`   Membership Status: ${finalMembership?.status}`);
    console.log(`   Membership Start: ${finalMembership?.startDate?.toISOString()}`);
    console.log(`   Membership End: ${finalMembership?.endDate?.toISOString()}`);
    console.log();

    console.log("✅ Recovery complete!");
  } catch (error: any) {
    console.error("❌ Recovery failed:", error.message);
    throw error;
  }
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
