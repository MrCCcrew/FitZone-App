/**
 * Accounting Report Service
 *
 * Core accounting calculation logic shared between:
 * - Production route: src/app/api/admin/accounting/route.ts
 * - Tests: __tests__/accounting-report-v3.test.ts
 */

import { db } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

// FitZone accounting timezone: Africa/Cairo (EET/EEST)
export const ACCOUNTING_TIMEZONE = "Africa/Cairo";

/**
 * Parse date string to start of day in Cairo timezone.
 * Ensures accounting reports recognize full Cairo business day regardless of server/DB timezone.
 *
 * Example: "2026-08-08" → 2026-08-08T00:00:00.000+02:00 (Cairo time) → UTC
 */
export function parseDateStart(value: string | null): Date | null {
  if (!value) return null;

  try {
    // Create date in Cairo timezone at start of day
    const cairoDate = new Date(value + "T00:00:00");
    if (Number.isNaN(cairoDate.getTime())) return null;

    // Convert to UTC for database query (DB stores UTC)
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ACCOUNTING_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(cairoDate);
    const year = parts.find(p => p.type === "year")?.value;
    const month = parts.find(p => p.type === "month")?.value;
    const day = parts.find(p => p.type === "day")?.value;

    // Reconstruct as Cairo midnight, then convert to UTC
    const cairoMidnight = new Date(`${year}-${month}-${day}T00:00:00`);

    // Get offset in minutes
    const cairoOffset = getCairoOffsetMinutes(cairoMidnight);
    const utcDate = new Date(cairoMidnight.getTime() - cairoOffset * 60000);

    return utcDate;
  } catch {
    return null;
  }
}

/**
 * Parse date string to start of NEXT day in Cairo timezone.
 * Used for half-open interval upper bound: [from, to)
 *
 * Example: "2026-08-08" → 2026-08-09T00:00:00.000+02:00 (Cairo time) → UTC
 * This represents the exclusive upper bound for Aug 8 business day.
 */
export function parseDateEnd(value: string | null): Date | null {
  if (!value) return null;

  try {
    // Parse the date and add 1 day to get start of next Cairo day
    const inputDate = new Date(value + "T00:00:00");
    if (Number.isNaN(inputDate.getTime())) return null;

    // Add 1 day
    const nextDay = new Date(inputDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ACCOUNTING_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(nextDay);
    const year = parts.find(p => p.type === "year")?.value;
    const month = parts.find(p => p.type === "month")?.value;
    const day = parts.find(p => p.type === "day")?.value;

    // Construct as Cairo midnight of next day, then convert to UTC
    const cairoNextDayStart = new Date(`${year}-${month}-${day}T00:00:00`);
    const cairoOffset = getCairoOffsetMinutes(cairoNextDayStart);
    const utcDate = new Date(cairoNextDayStart.getTime() - cairoOffset * 60000);

    return utcDate;
  } catch {
    return null;
  }
}

/**
 * Get Cairo timezone offset in minutes for a given date.
 * Handles DST transitions (Egypt uses DST inconsistently, but Intl handles it).
 */
export function getCairoOffsetMinutes(date: Date): number {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const cairoDate = new Date(date.toLocaleString("en-US", { timeZone: ACCOUNTING_TIMEZONE }));
  return Math.round((cairoDate.getTime() - utcDate.getTime()) / 60000);
}

/**
 * Create half-open interval filter: [from, to)
 * - from: inclusive (>=)
 * - to: exclusive (<) - represents start of next Cairo day
 */
export function createDateRangeFilter(field: string, from: Date | null, to: Date | null) {
  if (!from && !to) return undefined;
  return {
    [field]: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}), // Half-open interval: exclusive upper bound
    },
  };
}

export type StoreAccountingData = {
  grossSales: number;
  returnsTotal: number;
  salesRevenue: number;
  cogs: number;
  historicalNullConfirmedAtCount: number;
  salesCount: number;
  returnsCount: number;
};

/**
 * Calculate store accounting metrics for a given period.
 *
 * CRITICAL: Sale and return COGS are calculated separately to prevent period mixing.
 *
 * Example: Order sold Aug 8, returned Aug 9
 * - Aug 8 report: Revenue +500, COGS +300 (sale movements only)
 * - Aug 9 report: Returns -500, COGS -300 (return movements only)
 */
export async function calculateStoreAccounting(
  from: Date | null,
  to: Date | null,
  dbClient: any = db
): Promise<StoreAccountingData> {
  // Fetch sale orders (recognized on confirmedAt)
  // CRITICAL: Do NOT filter by current status
  // A sale that happened on Day 1 must remain in Day 1 report even if later cancelled
  const saleOrders = await dbClient.order.findMany({
    where: {
      businessUnit: "store",
      confirmedAt: { not: null }, // Must have completion event timestamp
      inventoryDeducted: true,    // Must have converted stock (proves actual sale)
      ...createDateRangeFilter("confirmedAt", from, to),
    },
    select: {
      id: true,
      total: true,
    },
  });

  // Fetch return orders (recognized on cancelledAt)
  // CRITICAL: Returns must have confirmedAt (prior completed sale) to prevent
  // orphan returns from appearing in reports when original sale was never recognized
  const returnOrders = await dbClient.order.findMany({
    where: {
      businessUnit: "store",
      status: "cancelled",
      confirmedAt: { not: null }, // Must have prior sale event
      cancelledAt: { not: null }, // Must have return event
      inventoryDeducted: true,
      ...createDateRangeFilter("cancelledAt", from, to),
    },
    select: {
      id: true,
      total: true,
    },
  });

  // Calculate revenue
  const grossSales = saleOrders.reduce((sum: number, o: any) => sum + o.total, 0);
  const returnsTotal = returnOrders.reduce((sum: number, o: any) => sum + o.total, 0);

  // ═════════════════════════════════════════════════════════════════════════════
  // COGS CALCULATION — SPLIT BY EVENT TYPE
  // ═════════════════════════════════════════════════════════════════════════════
  // CRITICAL: Fetch sale movements and return movements SEPARATELY to prevent
  // mixing them in the wrong accounting period.
  //
  // Wrong approach (old bug):
  //   Union all order IDs → fetch all movements → mix sale+return in same period
  //
  // Correct approach (V3 fixed):
  //   Fetch sale movements for sale orders ONLY
  //   Fetch return movements for return orders ONLY
  // ═════════════════════════════════════════════════════════════════════════════

  let saleCOGS = 0;
  let returnCOGS = 0;

  // Sale COGS: movements from orders sold in this period
  if (saleOrders.length > 0) {
    const saleMovements = await dbClient.inventoryMovement.findMany({
      where: {
        referenceType: { in: ["order", "Order"] },
        referenceId: { in: saleOrders.map((o: any) => o.id) },
        type: "sale", // ONLY sale movements
      },
      select: {
        quantityChange: true,
        unitCost: true,
      },
    });

    saleCOGS = saleMovements.reduce((sum: number, m: any) => {
      return sum + Math.abs(m.quantityChange) * (m.unitCost ?? 0);
    }, 0);
  }

  // Return COGS: movements from orders returned in this period
  if (returnOrders.length > 0) {
    const returnMovements = await dbClient.inventoryMovement.findMany({
      where: {
        referenceType: { in: ["order", "Order"] },
        referenceId: { in: returnOrders.map((o: any) => o.id) },
        type: "return", // ONLY return movements
      },
      select: {
        quantityChange: true,
        unitCost: true,
      },
    });

    returnCOGS = returnMovements.reduce((sum: number, m: any) => {
      return sum + Math.abs(m.quantityChange) * (m.unitCost ?? 0);
    }, 0);
  }

  // Net COGS: sale COGS increases expense, return COGS reduces expense
  const cogs = saleCOGS - returnCOGS;

  // Count historical orders with NULL confirmedAt
  const historicalNullConfirmedAtCount = await dbClient.order.count({
    where: {
      businessUnit: "store",
      confirmedAt: null,
      status: { in: ["confirmed", "preparing", "delivered"] },
    },
  });

  return {
    grossSales: Math.round((grossSales + Number.EPSILON) * 100) / 100,
    returnsTotal: Math.round((returnsTotal + Number.EPSILON) * 100) / 100,
    salesRevenue: Math.round((grossSales - returnsTotal + Number.EPSILON) * 100) / 100,
    cogs: Math.round((cogs + Number.EPSILON) * 100) / 100,
    historicalNullConfirmedAtCount,
    salesCount: saleOrders.length,
    returnsCount: returnOrders.length,
  };
}
