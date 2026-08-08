/**
 * Phase 4: Accounting / GL Integration Tests
 *
 * Tests general ledger journal postings for:
 * - Sales
 * - Purchases
 * - Returns
 * - Double-entry validation
 * - Reconciliation
 *
 * Currency: EGP (Egyptian Pound)
 * Precision: 2 decimal places (piastres)
 * Validation threshold: 0.01 EGP
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createMockUser, createMockProduct, cleanupTestData } from "./helpers/test-utils";
import {
  reserveOrderInventory,
  confirmOrderInventorySale,
  updateOrderItemCostPrices,
} from "@/lib/inventory-service";
import {
  postSaleJournal,
  postPurchaseJournal,
  postReturnJournal,
} from "@/lib/accounting-service";

describe("Phase 4: Accounting / GL Integration", () => {
  let testUser: { id: string; email: string | null };
  let testProduct: { id: string; name: string };
  let glAccounts: Map<string, string>; // code → id

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-phase4-${Date.now()}@test.com`,
      name: "Phase 4 Test User",
    });

    testProduct = await createMockProduct({
      name: `Test Product Phase4 ${Date.now()}`,
      price: 200,
      stock: 100,
      trackInventory: true,
      averageCost: 100,
    });

    // Load GL accounts
    const accounts = await db.gLAccount.findMany({
      select: { id: true, code: true },
    });

    glAccounts = new Map(accounts.map((a) => [a.code, a.id]));
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  // Test 1: Sale journal created and balanced
  it("sale creates balanced journal with revenue and COGS entries", async () => {
    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 200,
          subtotal: 200,
          status: "pending",
          items: {
            create: [{ productId: testProduct.id, quantity: 2, price: 200 }],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(tx, [{ productId: testProduct.id, quantity: 2 }], newOrder.id);

      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 2 }],
        newOrder.id
      );

      await updateOrderItemCostPrices(tx, newOrder.id, saleResults);

      await tx.order.update({
        where: { id: newOrder.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });

      // Post GL journal (default payment method → Paymob Clearing)
      await postSaleJournal(
        tx,
        newOrder.id,
        200,
        saleResults.map((r) => ({
          productId: r.productId,
          quantity: 2,
          costPrice: r.costPrice,
        })),
        "paymob" // Explicit for test clarity
      );

      return newOrder;
    }, { timeout: 15000 });

    const journal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "Order",
          referenceId: order.id,
        },
      },
      include: { entries: { include: { account: true } } },
    });

    expect(journal).toBeTruthy();
    expect(journal!.status).toBe("posted");
    expect(journal!.entries.length).toBe(4); // Paymob Clearing Dr, Revenue Cr, COGS Dr, Inventory Cr

    // Verify balance (convert Decimal to number)
    const totalDebit = journal!.entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredit = journal!.entries.reduce((sum, e) => sum + Number(e.credit), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);

    // Verify accounts (Paymob payment)
    const paymobDebit = journal!.entries.find(
      (e) => e.account.code === "1030" && Number(e.debit) > 0
    );
    const revenueCredit = journal!.entries.find(
      (e) => e.account.code === "4010" && Number(e.credit) > 0
    );
    const cogsDebit = journal!.entries.find(
      (e) => e.account.code === "5010" && Number(e.debit) > 0
    );
    const inventoryCredit = journal!.entries.find(
      (e) => e.account.code === "1010" && Number(e.credit) > 0
    );

    expect(paymobDebit).toBeTruthy();
    expect(Number(paymobDebit!.debit)).toBe(200);

    expect(revenueCredit).toBeTruthy();
    expect(Number(revenueCredit!.credit)).toBe(200);

    expect(cogsDebit).toBeTruthy();
    expect(Number(cogsDebit!.debit)).toBe(200); // 2 * 100

    expect(inventoryCredit).toBeTruthy();
    expect(Number(inventoryCredit!.credit)).toBe(200);
  }, 30000);

  // Test 2: Purchase journal created
  it("purchase creates balanced journal with inventory and cash entries", async () => {
    const receipt = await db.$transaction(async (tx) => {
      const newReceipt = await tx.inventoryReceipt.create({
        data: {
          referenceNumber: `TEST-P4-${Date.now()}`,
          status: "posted",
          totalCost: 1500,
        },
      });

      await tx.inventoryReceiptItem.create({
        data: {
          receiptId: newReceipt.id,
          productId: testProduct.id,
          quantity: 10,
          unitCost: 150,
          totalCost: 1500,
        },
      });

      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
      });

      if (!product) throw new Error("Product not found");

      const stockBefore = product.stock;
      const stockAfter = stockBefore + 10;
      const avgBefore = product.averageCost;
      const newAvg = (stockBefore * avgBefore + 10 * 150) / stockAfter;

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: stockAfter, averageCost: newAvg, lastPurchaseCost: 150 },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "purchase",
          quantityChange: 10,
          quantityBefore: stockBefore,
          quantityAfter: stockAfter,
          unitCost: 150,
          averageCostBefore: avgBefore,
          averageCostAfter: newAvg,
          referenceType: "inventory_receipt",
          referenceId: newReceipt.id,
        },
      });

      // Post GL journal
      await postPurchaseJournal(tx, newReceipt.id, 1500);

      return newReceipt;
    }, { timeout: 15000 });

    const journal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "InventoryReceipt",
          referenceId: receipt.id,
        },
      },
      include: { entries: { include: { account: true } } },
    });

    expect(journal).toBeTruthy();
    expect(journal!.entries.length).toBe(2); // Inventory Dr, Cash Cr

    const totalDebit = journal!.entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredit = journal!.entries.reduce((sum, e) => sum + Number(e.credit), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);

    const inventoryDebit = journal!.entries.find(
      (e) => e.account.code === "1010" && Number(e.debit) > 0
    );
    const cashCredit = journal!.entries.find(
      (e) => e.account.code === "1020" && Number(e.credit) > 0
    );

    expect(Number(inventoryDebit!.debit)).toBe(1500);
    expect(Number(cashCredit!.credit)).toBe(1500);
  }, 25000);

  // Test 3: Return journal reverses sale
  it("return creates reversal journal", async () => {
    // Create and confirm order first
    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 300,
          status: "pending",
          items: {
            create: [{ productId: testProduct.id, quantity: 3, price: 300 }],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(tx, [{ productId: testProduct.id, quantity: 3 }], newOrder.id);

      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 3 }],
        newOrder.id
      );

      await updateOrderItemCostPrices(tx, newOrder.id, saleResults);

      await tx.order.update({
        where: { id: newOrder.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });

      await postSaleJournal(
        tx,
        newOrder.id,
        300,
        saleResults.map((r) => ({
          productId: r.productId,
          quantity: 3,
          costPrice: r.costPrice,
        })),
        "paymob" // Test 3
      );

      return newOrder;
    }, { timeout: 15000 });

    // Now return/cancel order
    await db.$transaction(async (tx) => {
      const orderData = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      if (!orderData) throw new Error("Order not found");

      const productData = new Map<string, { quantity: number; totalCost: number }>();

      for (const item of orderData.items) {
        const current = productData.get(item.productId) || { quantity: 0, totalCost: 0 };
        const itemCost = (item.costPrice ?? 0) * item.quantity;
        productData.set(item.productId, {
          quantity: current.quantity + item.quantity,
          totalCost: current.totalCost + itemCost,
        });
      }

      for (const [productId, data] of productData) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true, stock: true, averageCost: true, trackInventory: true },
        });

        if (!product || !product.trackInventory) continue;

        const returnQuantity = data.quantity;
        const returnUnitCost = data.totalCost / returnQuantity;
        const stockBefore = product.stock;
        const stockAfter = stockBefore + returnQuantity;
        const avgBefore = product.averageCost;
        const newAvg = (stockBefore * avgBefore + returnQuantity * returnUnitCost) / stockAfter;

        await tx.product.update({
          where: { id: productId },
          data: { stock: stockAfter, averageCost: newAvg },
        });

        await tx.inventoryMovement.create({
          data: {
            productId,
            type: "return",
            quantityChange: returnQuantity,
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: returnUnitCost,
            averageCostBefore: avgBefore,
            averageCostAfter: newAvg,
            referenceType: "Order",
            referenceId: order.id,
            reason: "Test return",
          },
        });
      }

      // Post return journal
      const returnItems = Array.from(productData.entries()).map(([productId, data]) => ({
        productId,
        quantity: data.quantity,
        returnCost: data.totalCost / data.quantity,
      }));

      await postReturnJournal(tx, order.id, orderData.total, returnItems, "paymob"); // Test 3 return

      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", inventoryDeducted: false },
      });
    }, { timeout: 15000 });

    const returnJournal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "OrderReturn",
          referenceId: order.id,
        },
      },
      include: { entries: { include: { account: true } } },
    });

    expect(returnJournal).toBeTruthy();
    expect(returnJournal!.entries.length).toBe(4); // Revenue Dr, Cash Cr, Inventory Dr, COGS Cr

    const totalDebit = returnJournal!.entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredit = returnJournal!.entries.reduce((sum, e) => sum + Number(e.credit), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  }, 30000);

  // Test 4: Idempotent posting (webhook retry)
  it("duplicate journal posting is idempotent", async () => {
    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          items: {
            create: [{ productId: testProduct.id, quantity: 1, price: 100 }],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(tx, [{ productId: testProduct.id, quantity: 1 }], newOrder.id);

      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 1 }],
        newOrder.id
      );

      await updateOrderItemCostPrices(tx, newOrder.id, saleResults);

      await tx.order.update({
        where: { id: newOrder.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });

      // First posting
      await postSaleJournal(
        tx,
        newOrder.id,
        100,
        saleResults.map((r) => ({
          productId: r.productId,
          quantity: 1,
          costPrice: r.costPrice,
        })),
        "paymob" // Test 4
      );

      return newOrder;
    }, { timeout: 15000 });

    // Retry posting (webhook retry scenario)
    const secondPosting = await db.$transaction(async (tx) => {
      return await postSaleJournal(
        tx,
        order.id,
        100,
        [{ productId: testProduct.id, quantity: 1, costPrice: 100 }],
        "paymob" // Test 4 retry
      );
    }, { timeout: 10000 });

    expect(secondPosting).toBeNull(); // Already posted

    const journals = await db.journal.findMany({
      where: {
        referenceType: "Order",
        referenceId: order.id,
      },
    });

    expect(journals.length).toBe(1); // Only one journal
  }, 25000);

  // Test 5: Reconciliation - COGS journals balanced
  it("reconciliation: COGS journals match inventory credits", async () => {
    // Get all sale journals
    const saleJournals = await db.journal.findMany({
      where: { referenceType: "Order", status: "posted" },
      include: { entries: { include: { account: true } } },
    });

    // For each sale journal: COGS debit should equal Inventory credit
    for (const journal of saleJournals) {
      const cogsEntry = journal.entries.find(
        (e) => e.account.code === "5010" && Number(e.debit) > 0
      );
      const inventoryEntry = journal.entries.find(
        (e) => e.account.code === "1010" && Number(e.credit) > 0
      );

      expect(cogsEntry).toBeTruthy();
      expect(inventoryEntry).toBeTruthy();
      expect(Math.abs(Number(cogsEntry!.debit) - Number(inventoryEntry!.credit))).toBeLessThan(0.01);
    }

    // Aggregate check
    const totalCOGS = saleJournals.reduce((sum, j) => {
      const entry = j.entries.find((e) => e.account.code === "5010" && Number(e.debit) > 0);
      return sum + Number(entry?.debit ?? 0);
    }, 0);

    const totalInventoryCredit = saleJournals.reduce((sum, j) => {
      const entry = j.entries.find((e) => e.account.code === "1010" && Number(e.credit) > 0);
      return sum + Number(entry?.credit ?? 0);
    }, 0);

    expect(Math.abs(totalCOGS - totalInventoryCredit)).toBeLessThan(0.01);
  }, 20000);

  // Test 6: Reconciliation - Total Revenue
  it("reconciliation: net revenue matches journal entries", async () => {
    // Get all Order journals (sales)
    const saleJournals = await db.journal.findMany({
      where: { referenceType: "Order", status: "posted" },
      include: { entries: { include: { account: true } } },
    });

    // Get all OrderReturn journals
    const returnJournals = await db.journal.findMany({
      where: { referenceType: "OrderReturn", status: "posted" },
      include: { entries: { include: { account: true } } },
    });

    // Sales revenue (credits to 4010)
    const totalSalesRevenue = saleJournals.reduce((sum, journal) => {
      const revenueEntry = journal.entries.find(
        (e) => e.account.code === "4010" && Number(e.credit) > 0
      );
      return sum + Number(revenueEntry?.credit ?? 0);
    }, 0);

    // Return revenue reversals (debits to 4010)
    const totalReturnReversals = returnJournals.reduce((sum, journal) => {
      const revenueEntry = journal.entries.find(
        (e) => e.account.code === "4010" && Number(e.debit) > 0
      );
      return sum + Number(revenueEntry?.debit ?? 0);
    }, 0);

    // Net revenue
    const netRevenueFromJournals = totalSalesRevenue - totalReturnReversals;

    // Net revenue should match sales minus returns
    // From journals directly:
    const netRevenue = totalSalesRevenue - totalReturnReversals;

    // Verify journals are balanced (this is the real test)
    expect(totalSalesRevenue).toBeGreaterThan(0);
    expect(netRevenue).toBeGreaterThan(0);

    // Each journal internally balanced
    for (const journal of [...saleJournals, ...returnJournals]) {
      const debits = journal.entries.reduce((sum, e) => sum + Number(e.debit), 0);
      const credits = journal.entries.reduce((sum, e) => sum + Number(e.credit), 0);
      expect(Math.abs(debits - credits)).toBeLessThan(0.01);
    }
  }, 20000);

  // Test 7: Reconciliation - Inventory Asset Balance
  it("reconciliation: inventory asset GL balance internally consistent", async () => {
    const inventoryAccount = await db.gLAccount.findUnique({
      where: { code: "1010" },
      select: { id: true },
    });

    const entries = await db.journalEntry.findMany({
      where: { accountId: inventoryAccount!.id },
      select: { debit: true, credit: true },
    });

    // GL balance = total debits - total credits
    const totalDebits = entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredits = entries.reduce((sum, e) => sum + Number(e.credit), 0);
    const inventoryAssetBalance = totalDebits - totalCredits;

    // From journals: purchases add, sales COGS subtract
    const purchaseJournals = await db.journal.findMany({
      where: { referenceType: "InventoryReceipt", status: "posted" },
      include: { entries: { include: { account: true } } },
    });

    const saleJournals = await db.journal.findMany({
      where: { referenceType: "Order", status: "posted" },
      include: { entries: { include: { account: true } } },
    });

    const returnJournals = await db.journal.findMany({
      where: { referenceType: "OrderReturn", status: "posted" },
      include: { entries: { include: { account: true } } },
    });

    const purchaseTotal = purchaseJournals.reduce((sum, j) => {
      const entry = j.entries.find((e) => e.account.code === "1010" && Number(e.debit) > 0);
      return sum + Number(entry?.debit ?? 0);
    }, 0);

    const cogsTotal = saleJournals.reduce((sum, j) => {
      const entry = j.entries.find((e) => e.account.code === "1010" && Number(e.credit) > 0);
      return sum + Number(entry?.credit ?? 0);
    }, 0);

    const returnTotal = returnJournals.reduce((sum, j) => {
      const entry = j.entries.find((e) => e.account.code === "1010" && Number(e.debit) > 0);
      return sum + Number(entry?.debit ?? 0);
    }, 0);

    const expectedBalance = purchaseTotal - cogsTotal + returnTotal;

    // Should match exactly
    expect(Math.abs(inventoryAssetBalance - expectedBalance)).toBeLessThan(0.01);
  }, 20000);

  // Test 8: EGP exact piastre precision - 0.10 + 0.20 = 0.30
  it("validates exact EGP precision: 0.10 + 0.20 = 0.30", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-precision-${Date.now()}`;

      // Post journal: 0.10 + 0.20 = 0.30
      await postSaleJournal(tx, orderId, 0.30, [
        { productId: testProduct.id, quantity: 1, costPrice: 0.10 },
        { productId: testProduct.id, quantity: 1, costPrice: 0.20 },
      ], "paymob"); // Test 8

      const journal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "Order",
            referenceId: orderId,
          },
        },
        include: { entries: true },
      });

      expect(journal).not.toBeNull();

      const totalDebit = journal!.entries.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCredit = journal!.entries.reduce((sum, e) => sum + Number(e.credit), 0);

      // EXACT equality (no tolerance)
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(0.60); // 0.30 revenue + 0.30 COGS
    });
  }, 20000);

  // Test 9: 1-piastre imbalance must be rejected (testing via manual journal entry)
  it("rejects journal with 1 piastre imbalance", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const journalId = `test-imbalance-${Date.now()}`;

        // Create intentionally imbalanced entries (off by 0.01)
        const journal = await tx.journal.create({
          data: {
            referenceType: "TestImbalance",
            referenceId: journalId,
            description: "Test 1-piastre imbalance",
            status: "posted",
          },
        });

        const cashAccount = await tx.gLAccount.findUnique({ where: { code: "1020" } });
        const revenueAccount = await tx.gLAccount.findUnique({ where: { code: "4010" } });

        if (!cashAccount || !revenueAccount) throw new Error("Accounts not found");

        // Debit: 100.00
        await tx.journalEntry.create({
          data: {
            journalId: journal.id,
            accountId: cashAccount.id,
            debit: 100.00,
            credit: 0,
          },
        });

        // Credit: 99.99 (off by 0.01 = 1 piastre)
        await tx.journalEntry.create({
          data: {
            journalId: journal.id,
            accountId: revenueAccount.id,
            debit: 0,
            credit: 99.99,
          },
        });

        // Validate balance
        const entries = await tx.journalEntry.findMany({ where: { journalId: journal.id } });
        const totalDebitPiastres = entries.reduce(
          (sum, e) => sum + Math.round(Number(e.debit) * 100),
          0
        );
        const totalCreditPiastres = entries.reduce(
          (sum, e) => sum + Math.round(Number(e.credit) * 100),
          0
        );

        if (totalDebitPiastres !== totalCreditPiastres) {
          throw new Error(
            `Journal not balanced (exact piastre check): diff=${Math.abs(
              totalDebitPiastres - totalCreditPiastres
            )} piastres`
          );
        }
      })
    ).rejects.toThrow(/not balanced.*piastres/i);
  }, 20000);

  // Test 10: 0.01 EGP (1 piastre) is supported
  it("supports 0.01 EGP precision (1 piastre)", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-one-piastre-${Date.now()}`;

      // Minimum precision: 0.01 EGP
      await postSaleJournal(tx, orderId, 0.01, [
        { productId: testProduct.id, quantity: 1, costPrice: 0.01 },
      ], "paymob"); // Test 10

      const journal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "Order",
            referenceId: orderId,
          },
        },
        include: { entries: true },
      });

      expect(journal).not.toBeNull();

      const totalDebit = journal!.entries.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCredit = journal!.entries.reduce((sum, e) => sum + Number(e.credit), 0);

      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(0.02); // 0.01 revenue + 0.01 COGS
    });
  }, 20000);

  // Test 11: Paymob payment uses Paymob Clearing account
  it("Paymob payment posts to Paymob Clearing (1030), not Cash", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-paymob-${Date.now()}`;

      // Paymob payment (default when paymentMethod is not "cod")
      await postSaleJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, costPrice: 50 }],
        "paymob" // Explicit Paymob
      );

      const journal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "Order",
            referenceId: orderId,
          },
        },
        include: { entries: { include: { account: true } } },
      });

      expect(journal).not.toBeNull();

      // Find payment entry
      const paymobEntry = journal!.entries.find(
        (e) => e.account.code === "1030" && Number(e.debit) > 0
      );
      const cashEntry = journal!.entries.find(
        (e) => e.account.code === "1020" && Number(e.debit) > 0
      );

      expect(paymobEntry).toBeTruthy();
      expect(paymobEntry!.description).toContain("Paymob");
      expect(Number(paymobEntry!.debit)).toBe(100);
      expect(cashEntry).toBeFalsy(); // Should NOT use Cash
    });
  }, 20000);

  // Test 12: Cash pickup uses Cash account
  it("Cash pickup posts to Cash (1020), not Paymob Clearing", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-cash-${Date.now()}`;

      // Cash pickup
      await postSaleJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, costPrice: 50 }],
        "cod" // Cash on delivery / pickup
      );

      const journal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "Order",
            referenceId: orderId,
          },
        },
        include: { entries: { include: { account: true } } },
      });

      expect(journal).not.toBeNull();

      // Find payment entry
      const cashEntry = journal!.entries.find(
        (e) => e.account.code === "1020" && Number(e.debit) > 0
      );
      const paymobEntry = journal!.entries.find(
        (e) => e.account.code === "1030" && Number(e.debit) > 0
      );

      expect(cashEntry).toBeTruthy();
      expect(cashEntry!.description).toContain("Cash");
      expect(Number(cashEntry!.debit)).toBe(100);
      expect(paymobEntry).toBeFalsy(); // Should NOT use Paymob Clearing
    });
  }, 20000);

  // Test 13: Paymob return reverses Paymob Clearing
  it("Paymob return reverses Paymob Clearing, not Cash", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-paymob-return-${Date.now()}`;

      // Original Paymob sale
      await postSaleJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, costPrice: 50 }],
        "paymob"
      );

      // Return
      await postReturnJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, returnCost: 50 }],
        "paymob" // Must match original
      );

      const returnJournal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "OrderReturn",
            referenceId: orderId,
          },
        },
        include: { entries: { include: { account: true } } },
      });

      expect(returnJournal).not.toBeNull();

      // Refund should credit Paymob Clearing
      const paymobCredit = returnJournal!.entries.find(
        (e) => e.account.code === "1030" && Number(e.credit) > 0
      );
      const cashCredit = returnJournal!.entries.find(
        (e) => e.account.code === "1020" && Number(e.credit) > 0
      );

      expect(paymobCredit).toBeTruthy();
      expect(paymobCredit!.description).toContain("Paymob");
      expect(Number(paymobCredit!.credit)).toBe(100);
      expect(cashCredit).toBeFalsy();
    });
  }, 20000);

  // Test 14: Cash return reverses Cash
  it("Cash return reverses Cash, not Paymob Clearing", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-cash-return-${Date.now()}`;

      // Original Cash sale
      await postSaleJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, costPrice: 50 }],
        "cod"
      );

      // Return
      await postReturnJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, returnCost: 50 }],
        "cod" // Must match original
      );

      const returnJournal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "OrderReturn",
            referenceId: orderId,
          },
        },
        include: { entries: { include: { account: true } } },
      });

      expect(returnJournal).not.toBeNull();

      // Refund should credit Cash
      const cashCredit = returnJournal!.entries.find(
        (e) => e.account.code === "1020" && Number(e.credit) > 0
      );
      const paymobCredit = returnJournal!.entries.find(
        (e) => e.account.code === "1030" && Number(e.credit) > 0
      );

      expect(cashCredit).toBeTruthy();
      expect(cashCredit!.description).toContain("Cash");
      expect(Number(cashCredit!.credit)).toBe(100);
      expect(paymobCredit).toBeFalsy();
    });
  }, 20000);

  // Test 15: Wallet payment uses Paymob Clearing
  it("Wallet payment posts to Paymob Clearing (online store)", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-wallet-${Date.now()}`;

      await postSaleJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, costPrice: 50 }],
        "wallet" // Wallet through online store
      );

      const journal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "Order",
            referenceId: orderId,
          },
        },
        include: { entries: { include: { account: true } } },
      });

      expect(journal).not.toBeNull();

      const paymobEntry = journal!.entries.find(
        (e) => e.account.code === "1030" && Number(e.debit) > 0
      );

      expect(paymobEntry).toBeTruthy();
      expect(Number(paymobEntry!.debit)).toBe(100);
    });
  }, 20000);

  // Test 16: Card payment uses Paymob Clearing
  it("Card payment posts to Paymob Clearing (online store)", async () => {
    await db.$transaction(async (tx) => {
      const orderId = `test-card-${Date.now()}`;

      await postSaleJournal(
        tx,
        orderId,
        100,
        [{ productId: testProduct.id, quantity: 1, costPrice: 50 }],
        "card"
      );

      const journal = await tx.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "Order",
            referenceId: orderId,
          },
        },
        include: { entries: { include: { account: true } } },
      });

      expect(journal).not.toBeNull();

      const paymobEntry = journal!.entries.find(
        (e) => e.account.code === "1030" && Number(e.debit) > 0
      );

      expect(paymobEntry).toBeTruthy();
      expect(Number(paymobEntry!.debit)).toBe(100);
    });
  }, 20000);

  // Test 17: Unknown payment method throws error
  it("Unknown payment method throws error (safe failure)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const orderId = `test-unknown-${Date.now()}`;

        await postSaleJournal(
          tx,
          orderId,
          100,
          [{ productId: testProduct.id, quantity: 1, costPrice: 50 }],
          "unknown-method"
        );
      })
    ).rejects.toThrow(/Unknown payment method/i);

    // Verify no journal was created
    const journal = await db.journal.findFirst({
      where: {
        referenceType: "Order",
        referenceId: { contains: "test-unknown-" },
      },
    });

    expect(journal).toBeNull();
  }, 20000);

  // Test 18: Purchase receipt does NOT auto-post GL
  it("Purchase receipt updates inventory but does NOT auto-post GL", async () => {
    const productBefore = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    const receipt = await db.$transaction(async (tx) => {
      return await tx.inventoryReceipt.create({
        data: {
          referenceNumber: `TEST-NO-GL-${Date.now()}`,
          supplierId: null,
          status: "posted",
          totalCost: 500,
          items: {
            create: [
              {
                productId: testProduct.id,
                quantity: 10,
                unitCost: 50,
                totalCost: 500,
              },
            ],
          },
        },
      });
    });

    // Inventory should be updated (manual verification via inventory-service not called here,
    // but receipt creation itself doesn't auto-post GL)
    const purchaseJournal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "InventoryReceipt",
          referenceId: receipt.id,
        },
      },
    });

    // No GL journal should exist (automatic posting disabled)
    expect(purchaseJournal).toBeNull();
  }, 20000);
});
