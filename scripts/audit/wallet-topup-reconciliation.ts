/**
 * WALLET TOPUP RECONCILIATION - READ-ONLY AUDIT
 *
 * Purpose: Identify wallet_topup transactions that are paid but wallet was NOT credited
 *
 * ⚠️ READ-ONLY SCRIPT - NO MODIFICATIONS
 * ⚠️ NO UPDATE/INSERT/DELETE/COMMIT/PUSH
 * ⚠️ NO settled classification is DEFINITIVE without paymentTransactionId link
 *
 * Date: 2026-07-23
 */

import { Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface WalletTopupPayment {
  id: string;
  userId: string | null;
  referenceCode: string | null;
  providerReference: string | null;
  externalReference: string | null;
  amount: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
}

interface WalletTransactionRecord {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: Date;
}

type MatchConfidence = "strong_heuristic" | "weak_heuristic" | "none";
type Category = "CONFIRMED_UNSETTLED" | "SUSPECTED_UNSETTLED" | "POSSIBLY_SETTLED" | "MANUAL_REVIEW_AFTER_REPAIR" | "CRITICAL_DATA_ANOMALY";
type DescriptionClassification = "reference_match" | "generic_wallet_topup" | "other" | "empty";

interface ClassifiedWalletTransaction {
  id: string;
  amount: number;
  type: string;
  descriptionClassification: DescriptionClassification;
  createdAt: Date;
}

interface UnsettledAnalysis {
  payment: WalletTopupPayment;
  currentWalletBalance: number;
  walletTransactionsInWindow: ClassifiedWalletTransaction[];
  hasMatchingCredit: boolean;
  matchingCreditId: string | null;
  matchConfidence: MatchConfidence;
  category: Category;
}

async function analyzeWalletTopups() {
  try {
    console.log("=".repeat(80));
    console.log("WALLET TOPUP RECONCILIATION - READ-ONLY AUDIT");
    console.log("=".repeat(80));
    console.log("\n");

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 1: Count and aggregate statistics (COMPLETE dataset)
    // ────────────────────────────────────────────────────────────────────────────

    console.log("📊 STEP 1: Fetching statistics for ALL wallet_topup transactions...\n");

    const totalCount = await db.paymentTransaction.count({
      where: { purpose: "wallet_topup" },
    });

    const paidCount = await db.paymentTransaction.count({
      where: { purpose: "wallet_topup", status: "paid" },
    });

    // Count by currency to detect anomalies
    const paidByCurrency = await db.paymentTransaction.groupBy({
      by: ["currency"],
      where: { purpose: "wallet_topup", status: "paid" },
      _count: { id: true },
      _sum: { amount: true },
    });

    // Get oldest and newest paid transactions (EGP only)
    const oldestPaid = await db.paymentTransaction.findFirst({
      where: { purpose: "wallet_topup", status: "paid", currency: "EGP" },
      select: { id: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const newestPaid = await db.paymentTransaction.findFirst({
      where: { purpose: "wallet_topup", status: "paid", currency: "EGP" },
      select: { id: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    console.log(`   Total wallet_topup transactions: ${totalCount}`);
    console.log(`   Paid wallet_topup transactions: ${paidCount}`);
    console.log(`   Pending/failed/expired: ${totalCount - paidCount}\n`);

    console.log(`   Paid by currency:`);
    for (const cur of paidByCurrency) {
      const amount = cur._sum.amount ?? 0;
      console.log(`      ${cur.currency}: ${cur._count.id} transactions, ${amount} ${cur.currency}`);
    }
    if (oldestPaid) {
      console.log(`\n   Oldest paid (EGP): ${oldestPaid.paidAt?.toISOString() ?? oldestPaid.createdAt.toISOString()}`);
    }
    if (newestPaid) {
      console.log(`   Newest paid (EGP): ${newestPaid.paidAt?.toISOString() ?? newestPaid.createdAt.toISOString()}`);
    }
    console.log("\n");

    if (paidCount === 0) {
      console.log("✅ No paid wallet_topup transactions found. Audit complete.\n");
      return;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 2: Check for duplicate references
    // ────────────────────────────────────────────────────────────────────────────

    console.log("🔍 STEP 2: Checking for duplicate references...\n");

    const nullExternalCount = await db.paymentTransaction.count({
      where: {
        purpose: "wallet_topup",
        status: "paid",
        externalReference: null,
      },
    });

    // Check for duplicates by grouping
    const duplicateExternalRefs = await db.paymentTransaction.groupBy({
      by: ["externalReference"],
      where: {
        purpose: "wallet_topup",
        status: "paid",
        externalReference: { not: null },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 1 } },
      },
    });

    const duplicateProviderRefs = await db.paymentTransaction.groupBy({
      by: ["providerReference"],
      where: {
        purpose: "wallet_topup",
        status: "paid",
        providerReference: { not: null },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 1 } },
      },
    });

    console.log(`   Null externalReference in paid: ${nullExternalCount}`);
    console.log(`   Duplicate externalReference: ${duplicateExternalRefs.length > 0 ? duplicateExternalRefs.map((d) => d.externalReference).join(", ") : "None"}`);
    console.log(`   Duplicate providerReference: ${duplicateProviderRefs.length > 0 ? duplicateProviderRefs.map((d) => d.providerReference).join(", ") : "None"}`);
    console.log("\n");

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 3: Paginated analysis of ALL paid wallet_topup transactions
    // ────────────────────────────────────────────────────────────────────────────

    console.log("🔍 STEP 3: Analyzing settlement status for ALL paid transactions...\n");
    console.log("   Using cursor-based pagination to process all records...\n");

    const analyses: UnsettledAnalysis[] = [];
    const BATCH_SIZE = 100;
    let cursor: string | undefined = undefined;
    let processedCount = 0;

    while (true) {
      // Fetch batch with cursor pagination
      const baseQuery = {
        where: {
          purpose: "wallet_topup" as const,
          status: "paid" as const,
        },
        select: {
          id: true,
          userId: true,
          referenceCode: true,
          providerReference: true,
          externalReference: true,
          amount: true,
          currency: true,
          paidAt: true,
          createdAt: true,
          // DO NOT SELECT: checkoutUrl, providerPayload, metadata, name, email, phone
        },
        orderBy: {
          id: "asc" as const,
        },
        take: BATCH_SIZE,
      } satisfies Prisma.PaymentTransactionFindManyArgs;

      const batchQuery: Prisma.PaymentTransactionFindManyArgs = {
        ...baseQuery,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      };

      const batch = await db.paymentTransaction.findMany(batchQuery);

      if (batch.length === 0) break;

      processedCount += batch.length;
      console.log(`   Processing batch: ${processedCount} records...`);

      for (const payment of batch) {
        // CRITICAL DATA ANOMALY: Payment with non-EGP currency
        if (payment.currency !== "EGP") {
          analyses.push({
            payment: payment as WalletTopupPayment,
            currentWalletBalance: 0,
            walletTransactionsInWindow: [],
            hasMatchingCredit: false,
            matchingCreditId: null,
            matchConfidence: "none",
            category: "CRITICAL_DATA_ANOMALY",
          });
          continue;
        }

        // CRITICAL DATA ANOMALY: Payment without userId
        if (!payment.userId) {
          analyses.push({
            payment: payment as WalletTopupPayment,
            currentWalletBalance: 0,
            walletTransactionsInWindow: [],
            hasMatchingCredit: false,
            matchingCreditId: null,
            matchConfidence: "none",
            category: "CRITICAL_DATA_ANOMALY",
          });
          continue;
        }

        // Fetch user's wallet
        const wallet = await db.wallet.findUnique({
          where: { userId: payment.userId },
          select: {
            id: true,
            balance: true,
          },
        });

        // CRITICAL DATA ANOMALY: Payment with userId but no wallet
        if (!wallet) {
          analyses.push({
            payment: payment as WalletTopupPayment,
            currentWalletBalance: 0,
            walletTransactionsInWindow: [],
            hasMatchingCredit: false,
            matchingCreditId: null,
            matchConfidence: "none",
            category: "CRITICAL_DATA_ANOMALY",
          });
          continue;
        }

        // Define time window: 10 minutes before paidAt to 30 minutes after
        const referenceTime = payment.paidAt ?? payment.createdAt;
        const windowStart = new Date(referenceTime.getTime() - 10 * 60 * 1000);
        const windowEnd = new Date(referenceTime.getTime() + 30 * 60 * 1000);

        // Fetch wallet transactions WITHIN time window using WHERE clause
        const transactionsInWindow = await db.walletTransaction.findMany({
          where: {
            walletId: wallet.id,
            createdAt: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          select: {
            id: true,
            amount: true,
            type: true,
            description: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        });

        // Classify wallet transactions by description (DO NOT PRINT raw description)
        const classifiedTransactions: ClassifiedWalletTransaction[] = transactionsInWindow.map((wt) => {
          const desc = wt.description ?? "";
          let classification: DescriptionClassification = "empty";

          if (!desc) {
            classification = "empty";
          } else if (
            (payment.referenceCode && desc.includes(payment.referenceCode)) ||
            desc.includes(payment.id)
          ) {
            classification = "reference_match";
          } else if (desc.includes("شحن المحفظة") || desc.includes("شحن رصيد")) {
            classification = "generic_wallet_topup";
          } else {
            classification = "other";
          }

          return {
            id: wt.id,
            amount: wt.amount,
            type: wt.type,
            descriptionClassification: classification,
            createdAt: wt.createdAt,
          };
        });

        // Look for matching credit transaction with safe float comparison
        let matchingCredit: ClassifiedWalletTransaction | null = null;
        let matchConfidence: MatchConfidence = "none";

        for (const wt of classifiedTransactions) {
          if (wt.type !== "credit") continue;

          // Safe float comparison (tolerance: 0.001)
          const amountDiff = Math.abs(Number(wt.amount) - Number(payment.amount));
          if (amountDiff >= 0.001) continue;

          if (wt.descriptionClassification === "reference_match") {
            matchingCredit = wt;
            matchConfidence = "strong_heuristic"; // Amount + time + reference
            break;
          } else if (wt.descriptionClassification === "generic_wallet_topup") {
            // Keep looking for stronger match
            if (!matchingCredit) {
              matchingCredit = wt;
              matchConfidence = "weak_heuristic"; // Amount + time + generic description
            }
          }
        }

        // Determine category (NO settled classification is definitive)
        let category: Category;

        if (payment.id === "cmrxtztyq0001l11icou4grjj") {
          // This transaction was manually verified as unsettled
          // BUT if credit appeared after repair, needs manual review
          if (matchingCredit) {
            category = "MANUAL_REVIEW_AFTER_REPAIR";
          } else {
            category = "CONFIRMED_UNSETTLED";
          }
        } else if (matchingCredit) {
          // NOT settled - only "possibly settled" via heuristic
          category = "POSSIBLY_SETTLED";
        } else {
          category = "SUSPECTED_UNSETTLED";
        }

        analyses.push({
          payment: payment as WalletTopupPayment,
          currentWalletBalance: wallet.balance,
          walletTransactionsInWindow: classifiedTransactions,
          hasMatchingCredit: !!matchingCredit,
          matchingCreditId: matchingCredit?.id ?? null,
          matchConfidence,
          category,
        });
      }

      // Move cursor to last item in batch
      cursor = batch[batch.length - 1].id;

      // Exit if batch was smaller than expected (last batch)
      if (batch.length < BATCH_SIZE) break;
    }

    console.log(`   ✅ Completed analysis of ${processedCount} paid transactions\n`);

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 4: Separate results by category
    // ────────────────────────────────────────────────────────────────────────────

    const confirmedUnsettled = analyses.filter((a) => a.category === "CONFIRMED_UNSETTLED");
    const suspectedUnsettled = analyses.filter((a) => a.category === "SUSPECTED_UNSETTLED");
    const possiblySettled = analyses.filter((a) => a.category === "POSSIBLY_SETTLED");
    const manualReviewAfterRepair = analyses.filter((a) => a.category === "MANUAL_REVIEW_AFTER_REPAIR");
    const criticalAnomalies = analyses.filter((a) => a.category === "CRITICAL_DATA_ANOMALY");

    console.log("=".repeat(80));
    console.log("RESULTS SUMMARY");
    console.log("=".repeat(80));
    console.log("\n");

    console.log(`⚠️  POSSIBLY settled (heuristic match - NOT definitive): ${possiblySettled.length}`);
    console.log(`🔴 CONFIRMED unsettled (manually verified): ${confirmedUnsettled.length}`);
    console.log(`🟠 SUSPECTED unsettled (no matching credit found): ${suspectedUnsettled.length}`);
    console.log(`🔵 MANUAL REVIEW AFTER REPAIR (was unsettled, now has credit): ${manualReviewAfterRepair.length}`);
    console.log(`❌ CRITICAL DATA ANOMALY (no userId, no wallet, or non-EGP): ${criticalAnomalies.length}`);
    console.log("\n");

    const potentiallyUnsettledAmount =
      confirmedUnsettled.reduce((sum, a) => sum + a.payment.amount, 0) +
      suspectedUnsettled.reduce((sum, a) => sum + a.payment.amount, 0);

    console.log(`💰 Potentially unsettled amount: ${potentiallyUnsettledAmount} EGP`);
    console.log(`   (Confirmed + Suspected - NOT conclusive without manual review)\n`);

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 5A: Display CRITICAL DATA ANOMALIES first
    // ────────────────────────────────────────────────────────────────────────────

    if (criticalAnomalies.length > 0) {
      console.log("=".repeat(80));
      console.log("❌ CRITICAL DATA ANOMALIES");
      console.log("=".repeat(80));
      console.log("These payments have structural data issues:\n");

      for (const analysis of criticalAnomalies) {
        const p = analysis.payment;
        console.log(`❌ Payment ID: ${p.id}`);
        console.log(`   User ID: ${p.userId ?? "NULL (ANOMALY)"}`);
        console.log(`   Reference Code: ${p.referenceCode ?? "NULL"}`);
        console.log(`   Provider Reference: ${p.providerReference ?? "NULL"}`);
        console.log(`   External Reference: ${p.externalReference ?? "NULL"}`);
        console.log(`   Amount: ${p.amount} ${p.currency}`);
        console.log(`   Paid At: ${p.paidAt?.toISOString() ?? "NULL"}`);
        console.log(`   Created At: ${p.createdAt.toISOString()}`);

        let issue = "Unknown";
        if (p.currency !== "EGP") {
          issue = `Non-EGP currency: ${p.currency}`;
        } else if (!p.userId) {
          issue = "No userId";
        } else {
          issue = "No wallet found for userId";
        }
        console.log(`   Issue: ${issue}\n`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 5B: Display confirmed unsettled cases
    // ────────────────────────────────────────────────────────────────────────────

    if (confirmedUnsettled.length > 0) {
      console.log("=".repeat(80));
      console.log("A. CONFIRMED UNSETTLED TRANSACTIONS");
      console.log("=".repeat(80));
      console.log("Transaction ID cmrxtztyq0001l11icou4grjj - manually verified as unsettled:\n");

      for (const analysis of confirmedUnsettled) {
        const p = analysis.payment;
        console.log(`🔴 Payment ID: ${p.id}`);
        console.log(`   User ID: ${p.userId ?? "NULL"}`);
        console.log(`   Reference Code: ${p.referenceCode ?? "NULL"}`);
        console.log(`   Provider Reference: ${p.providerReference ?? "NULL"}`);
        console.log(`   External Reference: ${p.externalReference ?? "NULL"}`);
        console.log(`   Amount: ${p.amount} ${p.currency}`);
        console.log(`   Paid At: ${p.paidAt?.toISOString() ?? "NULL"}`);
        console.log(`   Created At: ${p.createdAt.toISOString()}`);
        console.log(`   Current Wallet Balance: ${analysis.currentWalletBalance} EGP`);
        console.log(`   Wallet Transactions in Window: ${analysis.walletTransactionsInWindow.length}`);

        if (analysis.walletTransactionsInWindow.length > 0) {
          console.log(`   Transactions in window (-10 min to +30 min):`);
          for (const wt of analysis.walletTransactionsInWindow) {
            console.log(`      - ${wt.type.toUpperCase()}: ${wt.amount} EGP at ${wt.createdAt.toISOString()}`);
            console.log(`        Description class: ${wt.descriptionClassification}`);
          }
        }

        console.log(`   ❌ Manually verified: No matching credit transaction\n`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 6: Display suspected unsettled cases
    // ────────────────────────────────────────────────────────────────────────────

    if (suspectedUnsettled.length > 0) {
      console.log("=".repeat(80));
      console.log("B. SUSPECTED UNSETTLED TRANSACTIONS");
      console.log("=".repeat(80));
      console.log("⚠️  Heuristic search found no matching credit transaction");
      console.log("⚠️  Matching is NOT conclusive - requires manual review\n");

      for (const analysis of suspectedUnsettled) {
        const p = analysis.payment;
        console.log(`🟠 Payment ID: ${p.id}`);
        console.log(`   User ID: ${p.userId ?? "NULL"}`);
        console.log(`   Reference Code: ${p.referenceCode ?? "NULL"}`);
        console.log(`   Provider Reference: ${p.providerReference ?? "NULL"}`);
        console.log(`   External Reference: ${p.externalReference ?? "NULL"}`);
        console.log(`   Amount: ${p.amount} ${p.currency}`);
        console.log(`   Paid At: ${p.paidAt?.toISOString() ?? "NULL"}`);
        console.log(`   Created At: ${p.createdAt.toISOString()}`);
        console.log(`   Current Wallet Balance: ${analysis.currentWalletBalance} EGP`);
        console.log(`   Wallet Transactions in Window: ${analysis.walletTransactionsInWindow.length}`);
        console.log(`   Match Confidence: ${analysis.matchConfidence}`);

        if (analysis.walletTransactionsInWindow.length > 0) {
          console.log(`   Transactions in window (-10 min to +30 min):`);
          for (const wt of analysis.walletTransactionsInWindow) {
            console.log(`      - ${wt.type.toUpperCase()}: ${wt.amount} EGP at ${wt.createdAt.toISOString()}`);
            console.log(`        Description class: ${wt.descriptionClassification}`);
          }
        } else {
          console.log(`   ❌ No wallet transactions in time window`);
        }

        console.log(`   ❌ No matching credit found with amount=${p.amount}\n`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 7: Display possibly settled cases (summary only)
    // ────────────────────────────────────────────────────────────────────────────

    if (possiblySettled.length > 0) {
      console.log("=".repeat(80));
      console.log("C. POSSIBLY SETTLED TRANSACTIONS (Heuristic Match - NOT Definitive)");
      console.log("=".repeat(80));
      console.log("⚠️  These appear to have matching credit transactions via heuristic");
      console.log("⚠️  WITHOUT paymentTransactionId link, NO match is conclusive\n");

      const strongHeuristic = possiblySettled.filter((a) => a.matchConfidence === "strong_heuristic");
      const weakHeuristic = possiblySettled.filter((a) => a.matchConfidence === "weak_heuristic");

      console.log(`   Strong heuristic (amount + time + reference): ${strongHeuristic.length}`);
      console.log(`   Weak heuristic (amount + time + generic description): ${weakHeuristic.length}\n`);

      for (const analysis of possiblySettled) {
        const p = analysis.payment;
        console.log(`⚠️  Payment ${p.id}: ${p.amount} ${p.currency}`);
        console.log(`   Match Confidence: ${analysis.matchConfidence.toUpperCase()}`);
        console.log(`   Matching credit transaction: ${analysis.matchingCreditId}`);
        console.log(`   Paid at: ${p.paidAt?.toISOString() ?? p.createdAt.toISOString()}\n`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 7B: Display manual review after repair cases
    // ────────────────────────────────────────────────────────────────────────────

    if (manualReviewAfterRepair.length > 0) {
      console.log("=".repeat(80));
      console.log("D. MANUAL REVIEW AFTER REPAIR");
      console.log("=".repeat(80));
      console.log("⚠️  These were previously confirmed unsettled but now have matching credit");
      console.log("⚠️  Requires manual verification that repair was successful\n");

      for (const analysis of manualReviewAfterRepair) {
        const p = analysis.payment;
        console.log(`🔵 Payment ${p.id}: ${p.amount} ${p.currency}`);
        console.log(`   Match Confidence: ${analysis.matchConfidence.toUpperCase()}`);
        console.log(`   Matching credit transaction: ${analysis.matchingCreditId}`);
        console.log(`   Paid at: ${p.paidAt?.toISOString() ?? p.createdAt.toISOString()}`);
        console.log(`   Current wallet balance: ${analysis.currentWalletBalance} EGP\n`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 8: Final summary
    // ────────────────────────────────────────────────────────────────────────────

    console.log("=".repeat(80));
    console.log("AUDIT COMPLETE");
    console.log("=".repeat(80));
    console.log("\n");

    console.log("📊 FINAL STATISTICS:\n");
    console.log(`   Total wallet_topup transactions: ${totalCount}`);
    console.log(`   Paid transactions: ${paidCount}\n`);

    console.log(`   Paid by currency:`);
    for (const cur of paidByCurrency) {
      const amount = cur._sum.amount ?? 0;
      console.log(`      ${cur.currency}: ${cur._count.id} transactions, ${amount} ${cur.currency}`);
    }
    console.log("");

    console.log(`   ⚠️  Possibly settled (heuristic - NOT definitive): ${possiblySettled.length}`);
    console.log(`   🔴 Confirmed unsettled (manually verified): ${confirmedUnsettled.length}`);
    console.log(`   🟠 Suspected unsettled: ${suspectedUnsettled.length}`);
    console.log(`   🔵 Manual review after repair: ${manualReviewAfterRepair.length}`);
    console.log(`   ❌ Critical data anomalies: ${criticalAnomalies.length}\n`);

    console.log(`   💰 Potentially unsettled amount: ${potentiallyUnsettledAmount} EGP`);
    console.log(`      (Confirmed + Suspected - NOT conclusive without manual review)\n`);

    console.log("⚠️  CRITICAL NOTES:");
    console.log("   - NO classification is DEFINITIVE without paymentTransactionId link");
    console.log("   - WalletTransaction has NO paymentTransactionId field");
    console.log("   - Match confidence: strong_heuristic | weak_heuristic | none");
    console.log("   - ALL heuristic matches are NON-CONCLUSIVE");
    console.log("   - Manual review REQUIRED for all suspected/possibly-settled cases");
    console.log("   - Check if credits were applied manually outside the system");
    console.log("   - ONLY cmrxtztyq0001l11icou4grjj is confirmed via manual verification\n");

    console.log("=".repeat(80));
    console.log("END OF READ-ONLY AUDIT");
    console.log("=".repeat(80));
  } catch (error) {
    // Sanitized error logging - NO stack traces with sensitive info
    if (error instanceof Error) {
      console.error("❌ ERROR occurred during audit:");
      console.error(`   Name: ${error.name}`);

      // Sanitize error message to remove sensitive data
      let sanitizedMessage = error.message;

      // Remove DATABASE_URL and connection strings
      sanitizedMessage = sanitizedMessage.replace(/DATABASE_URL[^\s]*/gi, "DATABASE_URL=***");
      sanitizedMessage = sanitizedMessage.replace(/mysql:\/\/[^\s]*/gi, "mysql://***");
      sanitizedMessage = sanitizedMessage.replace(/postgresql:\/\/[^\s]*/gi, "postgresql://***");

      // Remove potential credentials, passwords, tokens
      sanitizedMessage = sanitizedMessage.replace(/password[=:][^\s&]*/gi, "password=***");
      sanitizedMessage = sanitizedMessage.replace(/token[=:][^\s&]*/gi, "token=***");
      sanitizedMessage = sanitizedMessage.replace(/secret[=:][^\s&]*/gi, "secret=***");
      sanitizedMessage = sanitizedMessage.replace(/apikey[=:][^\s&]*/gi, "apikey=***");
      sanitizedMessage = sanitizedMessage.replace(/api_key[=:][^\s&]*/gi, "api_key=***");

      console.error(`   Message: ${sanitizedMessage}`);

      // Only log code if it exists (Prisma errors)
      if ("code" in error && error.code) {
        console.error(`   Code: ${error.code}`);
      }
    } else {
      console.error("❌ UNKNOWN ERROR occurred during audit");
    }

    // DO NOT log full stack trace - may contain DB connection strings or sensitive data
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTE
// ════════════════════════════════════════════════════════════════════════════

analyzeWalletTopups();
