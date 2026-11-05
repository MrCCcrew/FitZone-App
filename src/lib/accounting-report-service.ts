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
 * HOST-INDEPENDENT: Produces identical UTC result regardless of process TZ.
 *
 * Example: "2026-08-09" → 2026-08-08T22:00:00.000Z (Cairo midnight in UTC, DST-aware)
 */
export function parseDateStart(value: string | null): Date | null {
  if (!value) return null;

  try {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Start with UTC midnight for this calendar date (host-independent)
    const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);

    // Format this UTC instant in Cairo timezone to see Cairo's local time
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ACCOUNTING_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date(utcMidnight));
    const cairoHour = parseInt(parts.find(p => p.type === 'hour')!.value);
    const cairoMinute = parseInt(parts.find(p => p.type === 'minute')!.value);

    // If UTC midnight shows 02:00 in Cairo, Cairo is UTC+2
    // To get Cairo midnight, subtract 2 hours from UTC midnight
    const offsetMs = (cairoHour * 60 + cairoMinute) * 60 * 1000;
    const cairoMidnightUTC = utcMidnight - offsetMs;

    return new Date(cairoMidnightUTC);
  } catch {
    return null;
  }
}

/**
 * Parse date string to start of NEXT day in Cairo timezone.
 * HOST-INDEPENDENT: Produces identical UTC result regardless of process TZ.
 * Used for half-open interval upper bound: [from, to)
 *
 * Example: "2026-08-09" → 2026-08-09T22:00:00.000Z (next Cairo midnight in UTC)
 */
export function parseDateEnd(value: string | null): Date | null {
  if (!value) return null;

  try {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Start with UTC midnight for NEXT calendar date (host-independent)
    const utcNextDayMidnight = Date.UTC(year, month - 1, day + 1, 0, 0, 0);

    // Format this UTC instant in Cairo timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ACCOUNTING_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date(utcNextDayMidnight));
    const cairoHour = parseInt(parts.find(p => p.type === 'hour')!.value);
    const cairoMinute = parseInt(parts.find(p => p.type === 'minute')!.value);

    // Calculate offset and adjust to Cairo next-day midnight
    const offsetMs = (cairoHour * 60 + cairoMinute) * 60 * 1000;
    const cairoNextDayMidnightUTC = utcNextDayMidnight - offsetMs;

    return new Date(cairoNextDayMidnightUTC);
  } catch {
    return null;
  }
}

/**
 * Get Cairo timezone offset in minutes for a given UTC instant.
 * HOST-INDEPENDENT: Uses only Intl with explicit timezone.
 * Handles DST transitions (Egypt DST is inconsistent, but Intl handles it).
 */
export function getCairoOffsetMinutes(date: Date): number {
  const utcTimestamp = date.getTime();

  // Format the UTC instant in Cairo timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ACCOUNTING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const cairoYear = parseInt(parts.find(p => p.type === 'year')!.value);
  const cairoMonth = parseInt(parts.find(p => p.type === 'month')!.value);
  const cairoDay = parseInt(parts.find(p => p.type === 'day')!.value);
  const cairoHour = parseInt(parts.find(p => p.type === 'hour')!.value);
  const cairoMinute = parseInt(parts.find(p => p.type === 'minute')!.value);

  // Reconstruct Cairo local time as UTC timestamp
  const cairoAsUTC = Date.UTC(cairoYear, cairoMonth - 1, cairoDay, cairoHour, cairoMinute, 0);

  // Offset = Cairo local time - UTC time (in minutes)
  return Math.round((cairoAsUTC - utcTimestamp) / 60000);
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
