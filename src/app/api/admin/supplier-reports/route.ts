import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

type StatementEntry = {
  date: string;
  dateKey: string;
  type: string;
  reference: string;
  description: string;
  debitMinor: number;
  creditMinor: number;
};

function toMinor(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100);
}

function fromMinor(value: number): number {
  return value / 100;
}

function dateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function validDateKey(value: string | null): value is string {
  if (!value) return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T12:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

async function checkAdmin() {
  const guard = await requireAdminFeature("inventory");

  return "error" in guard ? guard.error : null;
}

async function buildBalances() {
  const [
    suppliers,
    invoices,
    postedInvoiceAllocations,
    liabilities,
    historicalPayments,
  ] = await Promise.all([
      db.supplier.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          deletedAt: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),

      db.purchaseInvoice.findMany({
        where: {
          postedAt: {
            not: null,
          },
        },
        select: {
          id: true,
          supplierId: true,
          totalAmount: true,
          status: true,
        },
      }),

      db.supplierPaymentAllocation.findMany({
        where: {
          supplierPayment: {
            status: "posted",
          },
        },
        select: {
          purchaseInvoiceId: true,
          amount: true,
        },
      }),

      db.consignmentSupplierLiability.findMany({
        select: {
          supplierId: true,
          grossAmount: true,
          paidAmount: true,
          reversedAmount: true,
        },
      }),

      db.supplierPayment.findMany({
        where: {
          postedAt: {
            not: null,
          },
        },
        select: {
          supplierId: true,
        },
      }),
    ]);

  const paidByInvoice = new Map<string, number>();

  for (const allocation of postedInvoiceAllocations) {
    paidByInvoice.set(
      allocation.purchaseInvoiceId,
      (paidByInvoice.get(allocation.purchaseInvoiceId) ?? 0) +
        toMinor(allocation.amount),
    );
  }

  const invoiceOutstandingBySupplier = new Map<string, number>();

  for (const invoice of invoices) {
    if (invoice.status !== "posted") continue;

    const outstandingMinor =
      toMinor(invoice.totalAmount) -
      (paidByInvoice.get(invoice.id) ?? 0);

    invoiceOutstandingBySupplier.set(
      invoice.supplierId,
      (invoiceOutstandingBySupplier.get(invoice.supplierId) ?? 0) +
        Math.max(0, outstandingMinor),
    );
  }

  const consignmentOutstandingBySupplier = new Map<string, number>();

  for (const liability of liabilities) {
    const outstandingMinor =
      toMinor(liability.grossAmount) -
      toMinor(liability.paidAmount) -
      toMinor(liability.reversedAmount);

    consignmentOutstandingBySupplier.set(
      liability.supplierId,
      (consignmentOutstandingBySupplier.get(liability.supplierId) ?? 0) +
        outstandingMinor,
    );
  }

  const balances = suppliers
    .map((supplier) => {
      const invoiceOutstandingMinor =
        invoiceOutstandingBySupplier.get(supplier.id) ?? 0;

      const consignmentOutstandingMinor =
        consignmentOutstandingBySupplier.get(supplier.id) ?? 0;

      const totalOutstandingMinor =
        invoiceOutstandingMinor + consignmentOutstandingMinor;

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        isActive: supplier.isActive,
        isDeleted: supplier.deletedAt != null,

        invoiceOutstanding: fromMinor(invoiceOutstandingMinor),
        consignmentOutstanding: fromMinor(
          consignmentOutstandingMinor,
        ),
        totalOutstanding: fromMinor(totalOutstandingMinor),
      };
    })
    .filter(
      (row) =>
        !row.isDeleted ||
        Math.abs(toMinor(row.totalOutstanding)) > 0,
    )
    .sort((a, b) => {
      const balanceDiff =
        toMinor(b.totalOutstanding) -
        toMinor(a.totalOutstanding);

      if (balanceDiff !== 0) return balanceDiff;

      return a.supplierName.localeCompare(
        b.supplierName,
        "ar",
      );
    });
  const activitySupplierIds = new Set<string>([
    ...invoices.map((invoice) => invoice.supplierId),
    ...liabilities.map((liability) => liability.supplierId),
    ...historicalPayments.map((payment) => payment.supplierId),
  ]);

  const balanceBySupplierId = new Map(
    balances.map((row) => [row.supplierId, row]),
  );

  const statementSuppliers = suppliers
    .filter(
      (supplier) =>
        supplier.deletedAt == null ||
        activitySupplierIds.has(supplier.id),
    )
    .map((supplier) => {
      const existing = balanceBySupplierId.get(supplier.id);

      if (existing) return existing;

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        isActive: supplier.isActive,
        isDeleted: supplier.deletedAt != null,
        invoiceOutstanding: 0,
        consignmentOutstanding: 0,
        totalOutstanding: 0,
      };
    });

  return {
    balances,
    statementSuppliers,
  };
}

async function buildStatement(
  supplierId: string,
  from: string | null,
  to: string | null,
) {
  const [supplier, invoices, liabilities, payments] =
    await Promise.all([
      db.supplier.findUnique({
        where: {
          id: supplierId,
        },
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          deletedAt: true,
        },
      }),

      db.purchaseInvoice.findMany({
        where: {
          supplierId,
          postedAt: {
            not: null,
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          postedAt: true,
          cancelledAt: true,
        },
      }),

      db.consignmentSupplierLiability.findMany({
        where: {
          supplierId,
        },
        select: {
          id: true,
          orderId: true,
          grossAmount: true,
          reversedAmount: true,
          source: true,
          createdAt: true,
          reversedAt: true,
        },
      }),

      db.supplierPayment.findMany({
        where: {
          supplierId,
        },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          referenceNumber: true,
          status: true,
          postedAt: true,
          cancelledAt: true,
        },
      }),
    ]);

  if (!supplier) {
    return null;
  }

  const events: StatementEntry[] = [];

  for (const invoice of invoices) {
    if (!invoice.postedAt) continue;

    events.push({
      date: invoice.postedAt.toISOString(),
      dateKey: dateKey(invoice.postedAt),
      type: "فاتورة مشتريات",
      reference:
        invoice.invoiceNumber ?? `#${invoice.id.slice(-8)}`,
      description: "ترحيل فاتورة مورد",
      debitMinor: toMinor(invoice.totalAmount),
      creditMinor: 0,
    });

    if (
      invoice.status === "cancelled" &&
      invoice.cancelledAt
    ) {
      events.push({
        date: invoice.cancelledAt.toISOString(),
        dateKey: dateKey(invoice.cancelledAt),
        type: "إلغاء فاتورة",
        reference:
          invoice.invoiceNumber ?? `#${invoice.id.slice(-8)}`,
        description: "عكس فاتورة مورد ملغاة",
        debitMinor: 0,
        creditMinor: toMinor(invoice.totalAmount),
      });
    }
  }

  for (const liability of liabilities) {
    events.push({
      date: liability.createdAt.toISOString(),
      dateKey: dateKey(liability.createdAt),
      type: "استحقاق أمانات",
      reference: `#${liability.orderId.slice(-8)}`,
      description:
        liability.source === "historical_correction"
          ? "تسوية تاريخية لمستحق مورد"
          : "استحقاق ناتج عن بيع أمانات",
      debitMinor: toMinor(liability.grossAmount),
      creditMinor: 0,
    });

    if (
      toMinor(liability.reversedAmount) > 0 &&
      liability.reversedAt
    ) {
      events.push({
        date: liability.reversedAt.toISOString(),
        dateKey: dateKey(liability.reversedAt),
        type: "عكس استحقاق",
        reference: `#${liability.orderId.slice(-8)}`,
        description: "مرتجع / عكس مستحق أمانات",
        debitMinor: 0,
        creditMinor: toMinor(liability.reversedAmount),
      });
    }
  }

  for (const payment of payments) {
    const wasPosted =
      payment.postedAt != null &&
      ["posted", "cancelled"].includes(payment.status);

    if (wasPosted) {
      events.push({
        date: payment.paymentDate.toISOString(),
        dateKey: dateKey(payment.paymentDate),
        type: "سداد مورد",
        reference:
          payment.referenceNumber ?? `#${payment.id.slice(-8)}`,
        description: "دفعة مورد مرحلة",
        debitMinor: 0,
        creditMinor: toMinor(payment.amount),
      });
    }

    if (
      payment.status === "cancelled" &&
      payment.postedAt &&
      payment.cancelledAt
    ) {
      events.push({
        date: payment.cancelledAt.toISOString(),
        dateKey: dateKey(payment.cancelledAt),
        type: "إلغاء سداد",
        reference:
          payment.referenceNumber ?? `#${payment.id.slice(-8)}`,
        description: "عكس دفعة مورد ملغاة",
        debitMinor: toMinor(payment.amount),
        creditMinor: 0,
      });
    }
  }

  events.sort((a, b) => {
    const timeDiff =
      new Date(a.date).getTime() -
      new Date(b.date).getTime();

    if (timeDiff !== 0) return timeDiff;

    const referenceDiff =
      a.reference.localeCompare(b.reference);

    if (referenceDiff !== 0) return referenceDiff;

    return a.type.localeCompare(b.type, "ar");
  });

  const openingMinor = events
    .filter(
      (entry) =>
        from != null &&
        entry.dateKey < from,
    )
    .reduce(
      (sum, entry) =>
        sum + entry.debitMinor - entry.creditMinor,
      0,
    );

  const selectedEvents = events.filter((entry) => {
    if (from && entry.dateKey < from) return false;
    if (to && entry.dateKey > to) return false;

    return true;
  });

  let runningMinor = openingMinor;

  const entries = selectedEvents.map((entry) => {
    runningMinor +=
      entry.debitMinor - entry.creditMinor;

    return {
      date: entry.date,
      dateKey: entry.dateKey,
      type: entry.type,
      reference: entry.reference,
      description: entry.description,
      debit: fromMinor(entry.debitMinor),
      credit: fromMinor(entry.creditMinor),
      balance: fromMinor(runningMinor),
    };
  });

  const debitMinor = selectedEvents.reduce(
    (sum, entry) => sum + entry.debitMinor,
    0,
  );

  const creditMinor = selectedEvents.reduce(
    (sum, entry) => sum + entry.creditMinor,
    0,
  );

  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      code: supplier.code,
      isActive: supplier.isActive,
      isDeleted: supplier.deletedAt != null,
    },

    from,
    to,

    openingBalance: fromMinor(openingMinor),
    debitTotal: fromMinor(debitMinor),
    creditTotal: fromMinor(creditMinor),
    closingBalance: fromMinor(
      openingMinor + debitMinor - creditMinor,
    ),

    entries,
  };
}

export async function GET(req: Request) {
  const authError = await checkAdmin();

  if (authError) {
    return authError;
  }

  try {
    const { searchParams } = new URL(req.url);

    const mode =
      searchParams.get("mode")?.trim().toLowerCase() ??
      "balances";

    if (mode === "balances") {
      const report = await buildBalances();

      return NextResponse.json(report);
    }

    if (mode !== "statement") {
      return NextResponse.json(
        {
          error: "نوع التقرير غير صحيح",
        },
        {
          status: 400,
        },
      );
    }

    const supplierId =
      searchParams.get("supplierId")?.trim() ?? "";

    if (!supplierId) {
      return NextResponse.json(
        {
          error: "المورد مطلوب",
        },
        {
          status: 400,
        },
      );
    }

    const rawFrom =
      searchParams.get("from")?.trim() || null;

    const rawTo =
      searchParams.get("to")?.trim() || null;

    if (rawFrom && !validDateKey(rawFrom)) {
      return NextResponse.json(
        {
          error: "تاريخ البداية غير صحيح",
        },
        {
          status: 400,
        },
      );
    }

    if (rawTo && !validDateKey(rawTo)) {
      return NextResponse.json(
        {
          error: "تاريخ النهاية غير صحيح",
        },
        {
          status: 400,
        },
      );
    }

    if (
      rawFrom &&
      rawTo &&
      rawFrom > rawTo
    ) {
      return NextResponse.json(
        {
          error:
            "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية",
        },
        {
          status: 400,
        },
      );
    }

    const statement = await buildStatement(
      supplierId,
      rawFrom,
      rawTo,
    );

    if (!statement) {
      return NextResponse.json(
        {
          error: "المورد غير موجود",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      statement,
    });
  } catch (error) {
    console.error(
      "[SUPPLIER_REPORTS_GET]",
      error,
    );

    return NextResponse.json(
      {
        error: "تعذر تحميل تقرير الموردين",
      },
      {
        status: 500,
      },
    );
  }
}