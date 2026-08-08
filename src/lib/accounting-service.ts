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
  ACCOUNTS_RECEIVABLE: "1030",
  ACCOUNTS_PAYABLE: "2010",
  OPENING_BALANCE_EQUITY: "3010",
  SALES_REVENUE: "4010",
  COGS: "5010",
};

interface JournalLineItem {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
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
async function postJournal(
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
 * Dr Cash/Receivable {amount}
 *   Cr Sales Revenue {amount}
 *
 * Dr COGS {qty * costPrice}
 *   Cr Inventory Asset {qty * costPrice}
 */
export async function postSaleJournal(
  tx: TransactionClient,
  orderId: string,
  orderTotal: number,
  items: Array<{ productId: string; quantity: number; costPrice: number }>
): Promise<string | null> {
  const totalCOGS = items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);

  const entries: JournalLineItem[] = [
    // Revenue recognition
    {
      accountCode: GL_ACCOUNTS.CASH, // Simplified: all sales → Cash
      debit: orderTotal,
      credit: 0,
      description: "Sale receipt",
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
 * Post purchase journal (Receipt)
 *
 * Dr Inventory Asset {qty * unitCost}
 *   Cr Cash/Payable {qty * unitCost}
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
      accountCode: GL_ACCOUNTS.CASH, // Simplified: all purchases → Cash
      debit: 0,
      credit: totalCost,
      description: "Purchase payment",
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
 * Dr Sales Revenue {amount}
 *   Cr Cash/Receivable {amount}
 *
 * Dr Inventory Asset {qty * returnCost}
 *   Cr COGS {qty * returnCost}
 */
export async function postReturnJournal(
  tx: TransactionClient,
  orderId: string,
  orderTotal: number,
  items: Array<{ productId: string; quantity: number; returnCost: number }>
): Promise<string | null> {
  const totalReturnCost = items.reduce((sum, item) => sum + item.quantity * item.returnCost, 0);

  const entries: JournalLineItem[] = [
    // Revenue reversal
    {
      accountCode: GL_ACCOUNTS.SALES_REVENUE,
      debit: orderTotal,
      credit: 0,
      description: "Sale return - revenue reversal",
    },
    {
      accountCode: GL_ACCOUNTS.CASH,
      debit: 0,
      credit: orderTotal,
      description: "Sale return - refund",
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
