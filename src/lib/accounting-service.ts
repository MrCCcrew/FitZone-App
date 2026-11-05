/**
 * Phase 4: Accounting Service
 *
 * Handles GL journal postings for inventory and sales transactions.
 * Implements double-entry bookkeeping with idempotency.
 *
 * Currency: EGP (Egyptian Pound)
 * Precision: 2 decimal places (piastres)
 * 1 EGP = 100 piastres
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// GL Account Codes
const GL_ACCOUNTS = {
  INVENTORY_ASSET: "1010",
  CASH: "1020",
  PAYMOB_CLEARING: "1030", // Paymob Clearing / مستحقات لدى Paymob (formerly Accounts Receivable)
  ACCOUNTS_PAYABLE: "2010",
  WALLET_LIABILITY: "2020",
  REWARD_POINTS_LIABILITY: "2030",
  OPENING_BALANCE_EQUITY: "3010",
  SALES_REVENUE: "4010",
  SUBSCRIPTION_REVENUE: "4020",
  COGS: "5010",
  REWARDS_PROMOTION_EXPENSE: "5020",
};

interface JournalLineItem {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

/**
 * Map payment method to GL account
 * Throws error on unknown method to prevent posting to wrong account
 */
function mapPaymentMethodToAccount(paymentMethod: string | null | undefined): string {
  const method = String(paymentMethod ?? "").toLowerCase().trim();

  // Cash pickup at gym
  if (method === "cod") {
    return GL_ACCOUNTS.CASH;
  }

  // Online store payments through Paymob
  // (card, paymob, wallet all go through Paymob checkout)
  if (method === "card" || method === "paymob" || method === "wallet") {
    return GL_ACCOUNTS.PAYMOB_CLEARING;
  }

  // Unknown method - fail safely
  throw new Error(
    `Unknown payment method for GL posting: "${method}". ` +
    `Expected: cod (cash) or card/paymob/wallet (online).`
  );
}

/**
 * Round to 2 decimal places (EGP precision - piastres)
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Convert EGP to piastres (minor units)
 * 1 EGP = 100 piastres
 */
function toPiastres(value: number): number {
  return Math.round(value * 100);
}

/**
 * Validate journal entries (double-entry)
 * EGP precision: EXACT balance at piastre level (no tolerance)
 * Even 1 piastre difference = invalid
 */
function validateEntries(entries: JournalLineItem[]): void {
  // Sum in piastres (minor units) for exact integer comparison
  const totalDebitPiastres = entries.reduce((sum, e) => sum + toPiastres(e.debit), 0);
  const totalCreditPiastres = entries.reduce((sum, e) => sum + toPiastres(e.credit), 0);

  if (totalDebitPiastres !== totalCreditPiastres) {
    const debitEGP = totalDebitPiastres / 100;
    const creditEGP = totalCreditPiastres / 100;
    const diffPiastres = Math.abs(totalDebitPiastres - totalCreditPiastres);

    throw new Error(
      `Journal entries not balanced (exact piastre check): debit=${debitEGP.toFixed(2)} EGP, credit=${creditEGP.toFixed(2)} EGP, diff=${diffPiastres} piastres`
    );
  }
}

/**
 * Get account ID by code
 */
async function getAccountId(tx: TransactionClient, code: string): Promise<string> {
  const account = await tx.gLAccount.findUnique({
    where: { code },
    select: { id: true },
  });

  if (!account) {
    throw new Error(`GL Account not found: ${code}`);
  }

  return account.id;
}

/**
 * Post journal (idempotent)
 */
export async function postJournal(
  tx: TransactionClient,
  referenceType: string,
  referenceId: string,
  description: string,
  entries: JournalLineItem[]
): Promise<string | null> {
  // Idempotency: check if journal already exists
  const existing = await tx.journal.findUnique({
    where: {
      referenceType_referenceId: {
        referenceType,
        referenceId,
      },
    },
  });

  if (existing) {
    return null; // Already posted
  }

  // Validate
  validateEntries(entries);

  // Create journal
  const journal = await tx.journal.create({
    data: {
      referenceType,
      referenceId,
      description,
      status: "posted",
    },
  });

  // Create entries
  for (const entry of entries) {
    const accountId = await getAccountId(tx, entry.accountCode);

    await tx.journalEntry.create({
      data: {
        journalId: journal.id,
        accountId,
        debit: new Prisma.Decimal(round2(entry.debit)),
        credit: new Prisma.Decimal(round2(entry.credit)),
        description: entry.description,
      },
    });
  }

  return journal.id;
}

/**
 * Post sale journal (Order confirmation)
 *
 * Payment account depends on order payment method:
 * - COD/Cash pickup: Dr Cash
 * - Paymob online: Dr Paymob Clearing
 *
 * Dr Cash/Paymob Clearing {amount}
 *   Cr Sales Revenue {amount}
 *
 * Dr COGS {qty * costPrice}
 *   Cr Inventory Asset {qty * costPrice}
 */
export async function postSaleJournal(
  tx: TransactionClient,
  orderId: string,
  orderTotal: number,
  items: Array<{ productId: string; quantity: number; costPrice: number }>,
  paymentMethod?: string
): Promise<string | null> {
  const totalCOGS = items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);

  // Map payment method to GL account (throws on unknown)
  const paymentAccount = mapPaymentMethodToAccount(paymentMethod);
  const isCashPickup = paymentAccount === GL_ACCOUNTS.CASH;
  const paymentDescription = isCashPickup ? "Cash sale" : "Paymob sale";

  const entries: JournalLineItem[] = [
    // Revenue recognition
    {
      accountCode: paymentAccount,
      debit: orderTotal,
      credit: 0,
      description: paymentDescription,
    },
    {
      accountCode: GL_ACCOUNTS.SALES_REVENUE,
      debit: 0,
      credit: orderTotal,
      description: "Sale revenue",
    },
    // COGS recognition
    {
      accountCode: GL_ACCOUNTS.COGS,
      debit: totalCOGS,
      credit: 0,
      description: "Cost of goods sold",
    },
    {
      accountCode: GL_ACCOUNTS.INVENTORY_ASSET,
      debit: 0,
      credit: totalCOGS,
      description: "Inventory reduction",
    },
  ];

  return await postJournal(
    tx,
    "Order",
    orderId,
    `Sale - Order #${orderId.slice(-8)}`,
    entries
  );
}

/**
 * Post promotional wallet credit.
 *
 * Dr Rewards & Promotion Expense
 *   Cr Wallet Liability
 *
 * Idempotent by WalletTransaction id.
 */
export async function postPromotionalWalletCreditJournal(
  tx: TransactionClient,
  walletTransactionId: string,
  amount: number,
): Promise<string | null> {
  const postedAmount = round2(
    Math.max(0, Number(amount)),
  );

  if (toPiastres(postedAmount) === 0) {
    return null;
  }

  return postJournal(
    tx,
    "WalletTransaction",
    walletTransactionId,
    `Promotional wallet credit - ${walletTransactionId.slice(-8)}`,
    [
      {
        accountCode:
          GL_ACCOUNTS.REWARDS_PROMOTION_EXPENSE,
        debit: postedAmount,
        credit: 0,
        description:
          "Rewards and promotion expense",
      },
      {
        accountCode:
          GL_ACCOUNTS.WALLET_LIABILITY,
        debit: 0,
        credit: postedAmount,
        description:
          "Promotional customer wallet liability",
      },
    ],
  );
}

/**
 * Post promotional reward-points grant.
 *
 * The amount is the EGP liability value captured at grant time,
 * not merely the number of points.
 *
 * Dr Rewards & Promotion Expense
 *   Cr Reward Points Liability
 *
 * Idempotent by RewardHistory id.
 */
export async function postPromotionalPointsGrantJournal(
  tx: TransactionClient,
  rewardHistoryId: string,
  liabilityAmount: number,
): Promise<string | null> {
  const postedAmount = round2(
    Math.max(0, Number(liabilityAmount)),
  );

  if (toPiastres(postedAmount) === 0) {
    return null;
  }

  return postJournal(
    tx,
    "RewardHistory",
    rewardHistoryId,
    `Promotional reward points - ${rewardHistoryId.slice(-8)}`,
    [
      {
        accountCode:
          GL_ACCOUNTS.REWARDS_PROMOTION_EXPENSE,
        debit: postedAmount,
        credit: 0,
        description:
          "Rewards and promotion expense",
      },
      {
        accountCode:
          GL_ACCOUNTS.REWARD_POINTS_LIABILITY,
        debit: 0,
        credit: postedAmount,
        description:
          "Reward points liability",
      },
    ],
  );
}

/**
 * Post accounting cutover opening liabilities.
 *
 * Existing customer wallet balances and outstanding reward points are
 * pre-cutover obligations, not current-period expenses.
 *
 * Dr Opening Balance Equity
 *   Cr Wallet Liability
 *   Cr Reward Points Liability
 *
 * Idempotent by a fixed cutover reference id.
 */
export async function postOpeningLiabilitiesJournal(
  tx: TransactionClient,
  cutoverId: string,
  input: {
    walletLiability?: number;
    rewardPointsLiability?: number;
  },
): Promise<string | null> {
  const walletLiability = round2(
    Math.max(0, Number(input.walletLiability ?? 0)),
  );
  const rewardPointsLiability = round2(
    Math.max(0, Number(input.rewardPointsLiability ?? 0)),
  );

  const totalLiability = round2(
    walletLiability + rewardPointsLiability,
  );

  if (toPiastres(totalLiability) === 0) {
    return null;
  }

  const entries: JournalLineItem[] = [
    {
      accountCode: GL_ACCOUNTS.OPENING_BALANCE_EQUITY,
      debit: totalLiability,
      credit: 0,
      description: "Accounting cutover opening liabilities",
    },
  ];

  if (walletLiability > 0) {
    entries.push({
      accountCode: GL_ACCOUNTS.WALLET_LIABILITY,
      debit: 0,
      credit: walletLiability,
      description: "Opening customer wallet liability",
    });
  }

  if (rewardPointsLiability > 0) {
    entries.push({
      accountCode: GL_ACCOUNTS.REWARD_POINTS_LIABILITY,
      debit: 0,
      credit: rewardPointsLiability,
      description: "Opening reward points liability",
    });
  }

  return postJournal(
    tx,
    "AccountingCutover",
    cutoverId,
    `Accounting cutover - ${cutoverId}`,
    entries,
  );
}

/**
 * Post paid wallet top-up journal.
 *
 * Customer money collected into the wallet is not revenue yet.
 *
 * Dr Paymob Clearing
 *   Cr Wallet Liability
 *
 * Idempotent by PaymentTransaction id.
 */
export async function postWalletTopupJournal(
  tx: TransactionClient,
  paymentTransactionId: string,
  amount: number,
): Promise<string | null> {
  const postedAmount = round2(Math.max(0, Number(amount)));

  if (toPiastres(postedAmount) === 0) {
    return null;
  }

  return postJournal(
    tx,
    "WalletTopup",
    paymentTransactionId,
    `Wallet top-up - Payment #${paymentTransactionId.slice(-8)}`,
    [
      {
        accountCode: GL_ACCOUNTS.PAYMOB_CLEARING,
        debit: postedAmount,
        credit: 0,
        description: "Wallet top-up collected via Paymob",
      },
      {
        accountCode: GL_ACCOUNTS.WALLET_LIABILITY,
        debit: 0,
        credit: postedAmount,
        description: "Customer wallet liability",
      },
    ],
  );
}

/**
 * Post subscription revenue journal.
 *
 * Revenue is based on the ACTUAL settlement components captured at purchase:
 *
 * Dr Paymob Clearing       externalPaidAmount
 * Dr Wallet Liability      walletAmount
 * Dr Reward Points Liab.   pointsAmount
 *   Cr Subscription Revenue total
 *
 * Commercial discounts are therefore excluded from revenue automatically.
 *
 * IMPORTANT:
 * - Call only after the membership is successfully active/paid.
 * - referenceType + membershipId makes the posting idempotent.
 * - Zero-value memberships create no journal.
 */
export async function postSubscriptionJournal(
  tx: TransactionClient,
  membershipId: string,
  input: {
    externalPaidAmount?: number;
    walletAmount?: number;
    pointsAmount?: number;
    externalPaymentAccount?: "paymob" | "cash";
  },
): Promise<string | null> {
  const externalPaidAmount = round2(Math.max(0, Number(input.externalPaidAmount ?? 0)));
  const walletAmount = round2(Math.max(0, Number(input.walletAmount ?? 0)));
  const pointsAmount = round2(Math.max(0, Number(input.pointsAmount ?? 0)));

  const revenueAmount = round2(
    externalPaidAmount + walletAmount + pointsAmount,
  );

  // A genuinely free / 100%-discounted membership has no consideration
  // and therefore no revenue journal.
  if (toPiastres(revenueAmount) === 0) {
    return null;
  }

  const entries: JournalLineItem[] = [];

  if (externalPaidAmount > 0) {
    entries.push({
      accountCode:
        input.externalPaymentAccount === "cash"
          ? GL_ACCOUNTS.CASH
          : GL_ACCOUNTS.PAYMOB_CLEARING,
      debit: externalPaidAmount,
      credit: 0,
      description:
        input.externalPaymentAccount === "cash"
          ? "Membership cash payment"
          : "Membership external payment",
    });
  }

  if (walletAmount > 0) {
    entries.push({
      accountCode: GL_ACCOUNTS.WALLET_LIABILITY,
      debit: walletAmount,
      credit: 0,
      description: "Wallet balance redeemed for membership",
    });
  }

  if (pointsAmount > 0) {
    entries.push({
      accountCode: GL_ACCOUNTS.REWARD_POINTS_LIABILITY,
      debit: pointsAmount,
      credit: 0,
      description: "Reward points redeemed for membership",
    });
  }

  entries.push({
    accountCode: GL_ACCOUNTS.SUBSCRIPTION_REVENUE,
    debit: 0,
    credit: revenueAmount,
    description: "Subscription revenue",
  });

  return postJournal(
    tx,
    "UserMembership",
    membershipId,
    `Subscription - Membership #${membershipId.slice(-8)}`,
    entries,
  );
}

/**
 * Post purchase journal (Receipt)
 *
 * DEFERRED: Purchase account mapping requires business confirmation
 * - Cash purchases vs Accounts Payable (supplier terms)
 * - Currently simplified to Cash only
 * - Production deployment should verify supplier payment terms
 *
 * Dr Inventory Asset {qty * unitCost}
 *   Cr Cash {qty * unitCost}
 */
export async function postPurchaseJournal(
  tx: TransactionClient,
  receiptId: string,
  totalCost: number
): Promise<string | null> {
  const entries: JournalLineItem[] = [
    {
      accountCode: GL_ACCOUNTS.INVENTORY_ASSET,
      debit: totalCost,
      credit: 0,
      description: "Inventory purchase",
    },
    {
      accountCode: GL_ACCOUNTS.CASH, // DEFERRED: All purchases → Cash (supplier terms not confirmed)
      debit: 0,
      credit: totalCost,
      description: "Purchase payment (cash)",
    },
  ];

  return await postJournal(
    tx,
    "InventoryReceipt",
    receiptId,
    `Purchase - Receipt #${receiptId.slice(-8)}`,
    entries
  );
}

/**
 * Post return journal (Order cancellation)
 *
 * Reverses original payment account:
 * - COD/Cash pickup: Cr Cash
 * - Paymob online: Cr Paymob Clearing
 *
 * Dr Sales Revenue {amount}
 *   Cr Cash/Paymob Clearing {amount}
 *
 * Dr Inventory Asset {qty * returnCost}
 *   Cr COGS {qty * returnCost}
 */
export async function postReturnJournal(
  tx: TransactionClient,
  orderId: string,
  orderTotal: number,
  items: Array<{ productId: string; quantity: number; returnCost: number }>,
  paymentMethod?: string // Must match original order payment method
): Promise<string | null> {
  const totalReturnCost = items.reduce((sum, item) => sum + item.quantity * item.returnCost, 0);

  // Reverse original payment account (same mapper as sale)
  const paymentAccount = mapPaymentMethodToAccount(paymentMethod);
  const isCashPickup = paymentAccount === GL_ACCOUNTS.CASH;
  const refundDescription = isCashPickup ? "Cash refund" : "Paymob refund";

  const entries: JournalLineItem[] = [
    // Revenue reversal
    {
      accountCode: GL_ACCOUNTS.SALES_REVENUE,
      debit: orderTotal,
      credit: 0,
      description: "Sale return - revenue reversal",
    },
    {
      accountCode: paymentAccount,
      debit: 0,
      credit: orderTotal,
      description: refundDescription,
    },
    // COGS reversal
    {
      accountCode: GL_ACCOUNTS.INVENTORY_ASSET,
      debit: totalReturnCost,
      credit: 0,
      description: "Sale return - inventory restoration",
    },
    {
      accountCode: GL_ACCOUNTS.COGS,
      debit: 0,
      credit: totalReturnCost,
      description: "Sale return - COGS reversal",
    },
  ];

  return await postJournal(
    tx,
    "OrderReturn",
    orderId,
    `Return - Order #${orderId.slice(-8)}`,
    entries
  );
}

/**
 * Post manual adjustment journal
 *
 * DEFERRED: Adjustment account mapping not confirmed
 * - Opening Balance Equity is for true opening balances only
 * - Adjustments should use reason-specific accounts (shrinkage, damage, etc.)
 * - This function exists but should not be called automatically in production
 *
 * Dr/Cr Inventory Asset {valuationChange}
 *   Cr/Dr Opening Balance Equity {valuationChange}
 */
export async function postAdjustmentJournal(
  tx: TransactionClient,
  adjustmentId: string,
  valuationChange: number,
  description: string
): Promise<string | null> {
  const entries: JournalLineItem[] =
    valuationChange > 0
      ? [
          // Positive adjustment (increase inventory)
          {
            accountCode: GL_ACCOUNTS.INVENTORY_ASSET,
            debit: Math.abs(valuationChange),
            credit: 0,
            description: "Inventory increase",
          },
          {
            accountCode: GL_ACCOUNTS.OPENING_BALANCE_EQUITY,
            debit: 0,
            credit: Math.abs(valuationChange),
            description: "Adjustment credit",
          },
        ]
      : [
          // Negative adjustment (decrease inventory)
          {
            accountCode: GL_ACCOUNTS.OPENING_BALANCE_EQUITY,
            debit: Math.abs(valuationChange),
            credit: 0,
            description: "Adjustment debit",
          },
          {
            accountCode: GL_ACCOUNTS.INVENTORY_ASSET,
            debit: 0,
            credit: Math.abs(valuationChange),
            description: "Inventory decrease",
          },
        ];

  return await postJournal(tx, "Adjustment", adjustmentId, description, entries);
}

/**
 * Reverse journal (void/cancellation)
 */
export async function reverseJournal(
  tx: TransactionClient,
  journalId: string
): Promise<string | null> {
  const journal = await tx.journal.findUnique({
    where: { id: journalId },
    include: { entries: { include: { account: true } } },
  });

  if (!journal) {
    throw new Error(`Journal not found: ${journalId}`);
  }

  if (journal.status === "reversed") {
    return null; // Already reversed
  }

  // Create reversal journal with swapped debits/credits
  const reversalEntries: JournalLineItem[] = journal.entries.map((entry) => ({
    accountCode: entry.account.code,
    debit: Number(entry.credit), // Swap and convert Decimal to number
    credit: Number(entry.debit),
    description: `Reversal: ${entry.description ?? ""}`,
  }));

  const reversalJournal = await tx.journal.create({
    data: {
      referenceType: `${journal.referenceType}Reversal`,
      referenceId: journal.referenceId,
      description: `Reversal of: ${journal.description}`,
      status: "posted",
      reversalJournalId: journal.id,
    },
  });

  for (const entry of reversalEntries) {
    const accountId = await getAccountId(tx, entry.accountCode);

    await tx.journalEntry.create({
      data: {
        journalId: reversalJournal.id,
        accountId,
        debit: new Prisma.Decimal(round2(entry.debit)),
        credit: new Prisma.Decimal(round2(entry.credit)),
        description: entry.description,
      },
    });
  }

  // Mark original as reversed
  await tx.journal.update({
    where: { id: journalId },
    data: { status: "reversed" },
  });

  return reversalJournal.id;
}

/**
 * Phase 3 consignment-aware store sale.
 *
 * Revenue side is unchanged.
 *
 * Owned inventory:
 *   Dr COGS
 *     Cr Inventory Asset
 *
 * Consignment inventory:
 *   Dr COGS
 *     Cr Accounts Payable
 *
 * Consignment goods never enter FitZone Inventory Asset.
 */
export async function postAllocatedSaleJournal(
  tx: TransactionClient,
  orderId: string,
  orderTotal: number,
  allocations: Array<{
    ownedCost: number;
    consignmentCost: number;
  }>,
  paymentMethod?: string
): Promise<string | null> {
  const ownedCost = round2(
    allocations.reduce(
      (sum, row) => sum + Number(row.ownedCost || 0),
      0
    )
  );

  const consignmentCost = round2(
    allocations.reduce(
      (sum, row) => sum + Number(row.consignmentCost || 0),
      0
    )
  );

  const totalCOGS = round2(
    ownedCost + consignmentCost
  );

  const paymentAccount =
    mapPaymentMethodToAccount(paymentMethod);

  const isCashPickup =
    paymentAccount === GL_ACCOUNTS.CASH;

  const entries: JournalLineItem[] = [
    {
      accountCode: paymentAccount,
      debit: orderTotal,
      credit: 0,
      description: isCashPickup
        ? "Cash sale"
        : "Paymob sale",
    },
    {
      accountCode: GL_ACCOUNTS.SALES_REVENUE,
      debit: 0,
      credit: orderTotal,
      description: "Sale revenue",
    },
  ];

  if (totalCOGS > 0) {
    entries.push({
      accountCode: GL_ACCOUNTS.COGS,
      debit: totalCOGS,
      credit: 0,
      description: "Cost of goods sold",
    });
  }

  if (ownedCost > 0) {
    entries.push({
      accountCode: GL_ACCOUNTS.INVENTORY_ASSET,
      debit: 0,
      credit: ownedCost,
      description: "Owned inventory reduction",
    });
  }

  if (consignmentCost > 0) {
    entries.push({
      accountCode: GL_ACCOUNTS.ACCOUNTS_PAYABLE,
      debit: 0,
      credit: consignmentCost,
      description:
        "Consignment supplier liability",
    });
  }

  return postJournal(
    tx,
    "Order",
    orderId,
    `Sale - Order #${orderId.slice(-8)}`,
    entries
  );
}

/**
 * Reverse a Phase 3 allocation-aware sale.
 *
 * Owned:
 *   Dr Inventory Asset
 *     Cr COGS
 *
 * Consignment:
 *   Dr Accounts Payable
 *     Cr COGS
 *
 * Revenue/payment reversal remains unchanged.
 */
export async function postAllocatedReturnJournal(
  tx: TransactionClient,
  orderId: string,
  orderTotal: number,
  allocations: Array<{
    ownedCost: number;
    consignmentCost: number;
  }>,
  paymentMethod?: string
): Promise<string | null> {
  const ownedCost = round2(
    allocations.reduce(
      (sum, row) =>
        sum + Number(row.ownedCost || 0),
      0
    )
  );

  const consignmentCost = round2(
    allocations.reduce(
      (sum, row) =>
        sum + Number(row.consignmentCost || 0),
      0
    )
  );

  const totalCost = round2(
    ownedCost + consignmentCost
  );

  const paymentAccount =
    mapPaymentMethodToAccount(paymentMethod);

  const entries: JournalLineItem[] = [
    {
      accountCode:
        GL_ACCOUNTS.SALES_REVENUE,
      debit: orderTotal,
      credit: 0,
      description:
        "Sale return - revenue reversal",
    },
    {
      accountCode: paymentAccount,
      debit: 0,
      credit: orderTotal,
      description:
        "Sale return - payment reversal",
    },
  ];

  if (ownedCost > 0) {
    entries.push({
      accountCode:
        GL_ACCOUNTS.INVENTORY_ASSET,
      debit: ownedCost,
      credit: 0,
      description:
        "Owned inventory restoration",
    });
  }

  if (consignmentCost > 0) {
    entries.push({
      accountCode:
        GL_ACCOUNTS.ACCOUNTS_PAYABLE,
      debit: consignmentCost,
      credit: 0,
      description:
        "Consignment supplier liability reversal",
    });
  }

  if (totalCost > 0) {
    entries.push({
      accountCode:
        GL_ACCOUNTS.COGS,
      debit: 0,
      credit: totalCost,
      description:
        "Cost of goods sold reversal",
    });
  }

  return postJournal(
    tx,
    "OrderReturn",
    orderId,
    `Return - Order #${orderId.slice(-8)}`,
    entries
  );
}
