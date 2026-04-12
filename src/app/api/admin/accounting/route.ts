import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

type BusinessUnit = "store" | "club";
type FeeRuleCategory = "platform" | "external_service" | "other";

function parseDateStart(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateEnd(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function inRangeFilter(field: string, from: Date | null, to: Date | null) {
  if (!from && !to) return undefined;
  return {
    [field]: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getPointValue() {
  const record = await db.siteContent.findUnique({ where: { section: "reward_settings" } });
  if (!record) return 0.1;
  try {
    const parsed = JSON.parse(record.content) as { pointValueEGP?: number };
    return typeof parsed.pointValueEGP === "number" ? parsed.pointValueEGP : 0.1;
  } catch {
    return 0.1;
  }
}

function normalizeUnit(value: unknown, fallback: BusinessUnit = "store"): BusinessUnit {
  return value === "club" ? "club" : fallback;
}

function matchesFeeRule(
  rule: {
    businessUnit: string;
    appliesToPurpose: string;
    provider: string | null;
    paymentMethod: string | null;
  },
  entry: {
    businessUnit: BusinessUnit;
    purpose: string;
    provider?: string | null;
    paymentMethod?: string | null;
  },
) {
  if (!(rule.businessUnit === "both" || rule.businessUnit === entry.businessUnit)) return false;
  if (!(rule.appliesToPurpose === "all" || rule.appliesToPurpose === entry.purpose)) return false;
  if (rule.provider && rule.provider !== (entry.provider ?? null)) return false;
  if (rule.paymentMethod && rule.paymentMethod !== (entry.paymentMethod ?? null)) return false;
  return true;
}

function calcRuleAmount(rule: { rateType: string; rateValue: number }, baseAmount: number) {
  if (rule.rateType === "fixed") return round2(rule.rateValue);
  return round2((baseAmount * rule.rateValue) / 100);
}

export async function GET(request: Request) {
  const guard = await requireAdminFeature("accounting");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const from = parseDateStart(searchParams.get("from"));
  const to = parseDateEnd(searchParams.get("to"));

  const [
    feeRules,
    expenses,
    orders,
    cancelledOrders,
    receipts,
    orderMovements,
    memberships,
    bookings,
    rewardPoints,
    rewardHistory,
    paymentTransactions,
    pointValueEGP,
  ] = await Promise.all([
    db.accountingFeeRule.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    db.accountingExpense.findMany({
      where: inRangeFilter("expenseDate", from, to),
      orderBy: { expenseDate: "desc" },
    }),
    db.order.findMany({
      where: {
        businessUnit: "store",
        status: { in: ["confirmed", "delivered"] },
        ...inRangeFilter("createdAt", from, to),
      },
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
        paymentTransactions: {
          where: { status: "paid" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { provider: true, paymentMethod: true, amount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Cancelled orders that were actually paid = returns/refunds
    db.order.findMany({
      where: {
        businessUnit: "store",
        status: "cancelled",
        ...inRangeFilter("createdAt", from, to),
        paymentTransactions: { some: { status: "paid" } },
      },
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.inventoryReceipt.findMany({
      where: inRangeFilter("receivedAt", from, to),
      include: {
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
    }),
    db.inventoryMovement.findMany({
      where: {
        referenceType: "order",
        type: { in: ["sale", "return"] },
        ...inRangeFilter("createdAt", from, to),
      },
    }),
    db.userMembership.findMany({
      where: {
        status: { in: ["active", "expired"] },
        ...inRangeFilter("startDate", from, to),
      },
      include: {
        user: { select: { name: true } },
        membership: { select: { name: true, walletBonus: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    db.booking.findMany({
      where: {
        status: { in: ["confirmed", "attended"] },
        ...inRangeFilter("createdAt", from, to),
      },
      include: {
        user: { select: { name: true } },
        schedule: {
          include: {
            class: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.rewardPoints.findMany({ select: { points: true } }),
    db.rewardHistory.findMany({
      where: inRangeFilter("createdAt", from, to),
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.paymentTransaction.findMany({
      where: {
        status: "paid",
        ...inRangeFilter("createdAt", from, to),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        purpose: true,
        provider: true,
        paymentMethod: true,
        amount: true,
        businessUnit: true,
        createdAt: true,
      },
    }),
    getPointValue(),
  ]);

  const storeExpenses = expenses.filter((expense) => expense.businessUnit === "store");
  const clubExpenses = expenses.filter((expense) => expense.businessUnit === "club");
  const activeFeeRules = feeRules.filter((rule) => rule.isActive);

  const storeOrderRows = orders.map((order) => {
    const payment = order.paymentTransactions[0] ?? null;
    return {
      id: order.id,
      date: order.createdAt.toISOString(),
      customerName: order.user.name ?? "عميل",
      items: order.items.map((item) => item.product.name).join("، "),
      paymentMethod: order.paymentMethod,
      provider: payment?.provider ?? null,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.total,
      status: order.status,
    };
  });

  const storeGrossSales = round2(storeOrderRows.reduce((sum, order) => sum + order.total, 0));
  const storeShippingRevenue = round2(storeOrderRows.reduce((sum, order) => sum + order.shippingFee, 0));
  const storeDiscounts = round2(orders.reduce((sum, order) => sum + order.discountTotal, 0));
  const storePurchaseInvoicesTotal = round2(receipts.reduce((sum, receipt) => sum + receipt.totalCost, 0));
  const storeExpensesTotal = round2(storeExpenses.reduce((sum, expense) => sum + expense.amount, 0));

  // Returns: cancelled orders that were actually paid
  const storeReturnRows = cancelledOrders.map((order) => ({
    id: order.id,
    date: order.createdAt.toISOString(),
    customerName: order.user.name ?? "عميل",
    items: order.items.map((item) => item.product.name).join("، "),
    paymentMethod: order.paymentMethod,
    total: order.total,
  }));
  const storeReturnsTotal = round2(storeReturnRows.reduce((sum, r) => sum + r.total, 0));

  // Net sales = gross sales - returns
  const storeSalesRevenue = round2(storeGrossSales - storeReturnsTotal);

  const storeCOGS = round2(
    orderMovements.reduce((sum, movement) => {
      const cost = Math.abs(movement.quantityChange) * (movement.unitCost ?? 0);
      if (movement.type === "return") return sum - cost;
      return sum + cost;
    }, 0),
  );

  const storeFeeEntries = storeOrderRows.flatMap((order) =>
    activeFeeRules
      .filter((rule) =>
        matchesFeeRule(rule, {
          businessUnit: "store",
          purpose: "order",
          provider: order.provider,
          paymentMethod: order.paymentMethod,
        }),
      )
      .map((rule) => ({
        ruleId: rule.id,
        label: rule.label,
        category: rule.category as FeeRuleCategory,
        amount: calcRuleAmount(rule, order.total),
      })),
  );
  const storeFeeTotal = round2(storeFeeEntries.reduce((sum, item) => sum + item.amount, 0));
  const storeGrossProfit = round2(storeSalesRevenue - storeCOGS);
  const storeNetProfit = round2(storeGrossProfit - storeExpensesTotal - storeFeeTotal);

  const membershipRows = memberships.map((membership) => ({
    id: membership.id,
    date: membership.startDate.toISOString(),
    customerName: membership.user.name ?? "مشتركة",
    membershipName: membership.membership.name,
    paymentAmount: membership.paymentAmount,
    paymentMethod: membership.paymentMethod ?? "cash",
    walletBonus: membership.membership.walletBonus ?? 0,
    status: membership.status,
    offerTitle: membership.offerTitle,
  }));
  const bookingRows = bookings.map((booking) => ({
    id: booking.id,
    date: booking.createdAt.toISOString(),
    customerName: booking.user.name ?? "مشتركة",
    className: booking.schedule.class.name,
    paymentMethod: booking.paymentMethod,
    paidAmount: booking.paidAmount,
    status: booking.status,
  }));

  const membershipRevenue = round2(membershipRows.reduce((sum, row) => sum + row.paymentAmount, 0));
  const bookingRevenue = round2(bookingRows.reduce((sum, row) => sum + row.paidAmount, 0));
  const clubRevenue = round2(membershipRevenue + bookingRevenue);
  const walletBonusCost = round2(membershipRows.reduce((sum, row) => sum + row.walletBonus, 0));

  // Wallet topups: money collected but not yet earned (deferred liability)
  const walletTopupRows = paymentTransactions.filter((tx) => tx.purpose === "wallet_topup");
  const walletTopupCollected = round2(walletTopupRows.reduce((sum, tx) => sum + tx.amount, 0));
  const pointsLiability = round2(rewardPoints.reduce((sum, reward) => sum + reward.points * pointValueEGP, 0));
  const redeemedPointsCost = round2(
    rewardHistory.reduce((sum, row) => {
      if (row.points >= 0) return sum;
      return sum + Math.abs(row.points) * pointValueEGP;
    }, 0),
  );
  const clubExpensesTotal = round2(clubExpenses.reduce((sum, expense) => sum + expense.amount, 0));

  const clubFeeSourceEntries = [
    ...membershipRows.map((row) => ({
      businessUnit: "club" as const,
      purpose: "membership",
      paymentMethod: row.paymentMethod,
      provider: row.paymentMethod,
      amount: row.paymentAmount,
    })),
    ...bookingRows.map((row) => ({
      businessUnit: "club" as const,
      purpose: "booking",
      paymentMethod: row.paymentMethod,
      provider: row.paymentMethod,
      amount: row.paidAmount,
    })),
    ...paymentTransactions
      .filter((tx) => tx.purpose === "wallet_topup")
      .map((tx) => ({
        businessUnit: normalizeUnit(tx.businessUnit, "club"),
        purpose: tx.purpose,
        paymentMethod: tx.paymentMethod,
        provider: tx.provider,
        amount: tx.amount,
      })),
  ];

  const clubFeeEntries = clubFeeSourceEntries.flatMap((entry) =>
    activeFeeRules
      .filter((rule) =>
        matchesFeeRule(rule, {
          businessUnit: "club",
          purpose: entry.purpose,
          provider: entry.provider,
          paymentMethod: entry.paymentMethod,
        }),
      )
      .map((rule) => ({
        ruleId: rule.id,
        label: rule.label,
        category: rule.category as FeeRuleCategory,
        amount: calcRuleAmount(rule, entry.amount),
      })),
  );
  const clubFeeTotal = round2(clubFeeEntries.reduce((sum, item) => sum + item.amount, 0));
  const clubGrossProfit = round2(clubRevenue - walletBonusCost - redeemedPointsCost);
  const clubNetProfit = round2(clubGrossProfit - clubExpensesTotal - clubFeeTotal);

  const payload = {
    range: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    feeRules: feeRules.map((rule) => ({
      id: rule.id,
      businessUnit: rule.businessUnit,
      category: rule.category,
      label: rule.label,
      appliesToPurpose: rule.appliesToPurpose,
      provider: rule.provider,
      paymentMethod: rule.paymentMethod,
      rateType: rule.rateType,
      rateValue: rule.rateValue,
      notes: rule.notes,
      isActive: rule.isActive,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      businessUnit: expense.businessUnit,
      category: expense.category,
      label: expense.label,
      description: expense.description,
      amount: expense.amount,
      vendor: expense.vendor,
      referenceNumber: expense.referenceNumber,
      expenseDate: expense.expenseDate.toISOString(),
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
    })),
    store: {
      summary: {
        grossSales: storeGrossSales,
        returnsTotal: storeReturnsTotal,
        salesRevenue: storeSalesRevenue,
        shippingRevenue: storeShippingRevenue,
        discountsGranted: storeDiscounts,
        purchaseInvoicesTotal: storePurchaseInvoicesTotal,
        cogs: storeCOGS,
        expenseTotal: storeExpensesTotal,
        feeTotal: storeFeeTotal,
        grossProfit: storeGrossProfit,
        netProfit: storeNetProfit,
        orderCount: storeOrderRows.length,
        returnCount: storeReturnRows.length,
        purchaseInvoiceCount: receipts.length,
      },
      sales: storeOrderRows,
      returns: storeReturnRows,
      purchases: receipts.map((receipt) => ({
        id: receipt.id,
        date: receipt.receivedAt.toISOString(),
        referenceNumber: receipt.referenceNumber,
        supplierName: receipt.supplierName,
        totalCost: receipt.totalCost,
        items: receipt.items.map((item) => ({
          productName: item.product.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
        })),
      })),
      expenses: storeExpenses.map((expense) => ({
        id: expense.id,
        category: expense.category,
        label: expense.label,
        amount: expense.amount,
        vendor: expense.vendor,
        expenseDate: expense.expenseDate.toISOString(),
      })),
      feeBreakdown: storeFeeEntries,
    },
    club: {
      summary: {
        membershipRevenue,
        bookingRevenue,
        totalRevenue: clubRevenue,
        walletTopupCollected,
        walletBonusCost,
        redeemedPointsCost,
        currentPointsLiability: pointsLiability,
        expenseTotal: clubExpensesTotal,
        feeTotal: clubFeeTotal,
        grossProfit: clubGrossProfit,
        netProfit: clubNetProfit,
        membershipCount: membershipRows.length,
        bookingCount: bookingRows.length,
        walletTopupCount: walletTopupRows.length,
      },
      memberships: membershipRows,
      bookings: bookingRows,
      expenses: clubExpenses.map((expense) => ({
        id: expense.id,
        category: expense.category,
        label: expense.label,
        amount: expense.amount,
        vendor: expense.vendor,
        expenseDate: expense.expenseDate.toISOString(),
      })),
      rewards: {
        pointValueEGP,
        currentPointsLiability: pointsLiability,
        redeemedPointsCost,
      },
      feeBreakdown: clubFeeEntries,
    },
  };

  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const guard = await requireAdminFeature("accounting");
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    entityType?: "expense" | "feeRule";
    payload?: Record<string, unknown>;
  };

  if (body.entityType === "expense") {
    const payload = body.payload ?? {};
    const expense = await db.accountingExpense.create({
      data: {
        businessUnit: normalizeUnit(payload.businessUnit),
        category: String(payload.category ?? "general"),
        label: String(payload.label ?? "").trim(),
        description: payload.description ? String(payload.description) : null,
        amount: Number(payload.amount ?? 0),
        vendor: payload.vendor ? String(payload.vendor) : null,
        referenceNumber: payload.referenceNumber ? String(payload.referenceNumber) : null,
        expenseDate: payload.expenseDate ? new Date(String(payload.expenseDate)) : new Date(),
      },
    });
    return NextResponse.json({ success: true, id: expense.id });
  }

  if (body.entityType === "feeRule") {
    const payload = body.payload ?? {};
    const rule = await db.accountingFeeRule.create({
      data: {
        businessUnit: payload.businessUnit === "club" || payload.businessUnit === "both" ? String(payload.businessUnit) : "store",
        category:
          payload.category === "external_service" || payload.category === "other" ? String(payload.category) : "platform",
        label: String(payload.label ?? "").trim(),
        appliesToPurpose: String(payload.appliesToPurpose ?? "all"),
        provider: payload.provider ? String(payload.provider) : null,
        paymentMethod: payload.paymentMethod ? String(payload.paymentMethod) : null,
        rateType: payload.rateType === "fixed" ? "fixed" : "percentage",
        rateValue: Number(payload.rateValue ?? 0),
        notes: payload.notes ? String(payload.notes) : null,
        isActive: payload.isActive !== false,
      },
    });
    return NextResponse.json({ success: true, id: rule.id });
  }

  return NextResponse.json({ error: "نوع العملية غير مدعوم." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const guard = await requireAdminFeature("accounting");
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    entityType?: "expense" | "feeRule";
    id?: string;
    payload?: Record<string, unknown>;
  };

  if (!body.id) {
    return NextResponse.json({ error: "المعرف مطلوب." }, { status: 400 });
  }

  if (body.entityType === "expense") {
    const payload = body.payload ?? {};
    await db.accountingExpense.update({
      where: { id: body.id },
      data: {
        businessUnit: payload.businessUnit ? normalizeUnit(payload.businessUnit) : undefined,
        category: payload.category ? String(payload.category) : undefined,
        label: payload.label ? String(payload.label).trim() : undefined,
        description: payload.description === undefined ? undefined : payload.description ? String(payload.description) : null,
        amount: payload.amount === undefined ? undefined : Number(payload.amount),
        vendor: payload.vendor === undefined ? undefined : payload.vendor ? String(payload.vendor) : null,
        referenceNumber:
          payload.referenceNumber === undefined ? undefined : payload.referenceNumber ? String(payload.referenceNumber) : null,
        expenseDate: payload.expenseDate ? new Date(String(payload.expenseDate)) : undefined,
      },
    });
    return NextResponse.json({ success: true });
  }

  if (body.entityType === "feeRule") {
    const payload = body.payload ?? {};
    await db.accountingFeeRule.update({
      where: { id: body.id },
      data: {
        businessUnit:
          payload.businessUnit === undefined
            ? undefined
            : payload.businessUnit === "club" || payload.businessUnit === "both"
              ? String(payload.businessUnit)
              : "store",
        category:
          payload.category === undefined
            ? undefined
            : payload.category === "external_service" || payload.category === "other"
              ? String(payload.category)
              : "platform",
        label: payload.label ? String(payload.label).trim() : undefined,
        appliesToPurpose: payload.appliesToPurpose ? String(payload.appliesToPurpose) : undefined,
        provider: payload.provider === undefined ? undefined : payload.provider ? String(payload.provider) : null,
        paymentMethod: payload.paymentMethod === undefined ? undefined : payload.paymentMethod ? String(payload.paymentMethod) : null,
        rateType: payload.rateType === undefined ? undefined : payload.rateType === "fixed" ? "fixed" : "percentage",
        rateValue: payload.rateValue === undefined ? undefined : Number(payload.rateValue),
        notes: payload.notes === undefined ? undefined : payload.notes ? String(payload.notes) : null,
        isActive: payload.isActive === undefined ? undefined : Boolean(payload.isActive),
      },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "نوع العملية غير مدعوم." }, { status: 400 });
}
