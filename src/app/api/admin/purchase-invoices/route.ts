import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";
import {
  cancelPurchaseInvoice,
  createPurchaseInvoiceDraft,
  getPurchaseInvoiceBalance,
  postPurchaseInvoice,
} from "@/lib/supplier-ap-service";

async function checkAdmin() {
  const guard = await requireAdminFeature("inventory");

  return "error" in guard
    ? { error: guard.error, userId: null }
    : { error: null, userId: guard.session.user.id };
}

function parseDate(value: unknown, field: string): Date {
  const date = new Date(String(value ?? ""));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} غير صحيح`);
  }

  return date;
}

function nullableDate(value: unknown, field: string): Date | null {
  if (value == null || value === "") return null;
  return parseDate(value, field);
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);

  const supplierId = searchParams.get("supplierId")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;

  const invoices = await db.purchaseInvoice.findMany({
    where: {
      ...(supplierId ? { supplierId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      items: true,
      allocations: {
        include: {
          supplierPayment: {
            select: {
              id: true,
              status: true,
              paymentDate: true,
              paymentMethod: true,
              referenceNumber: true,
            },
          },
        },
      },
    },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const rows = invoices.map((invoice) => {
    const totalMinor = Math.round(Number(invoice.totalAmount) * 100);

    const paidMinor = invoice.allocations
      .filter((allocation) => allocation.supplierPayment.status === "posted")
      .reduce(
        (sum, allocation) => sum + Math.round(Number(allocation.amount) * 100),
        0,
      );

    const outstandingMinor = totalMinor - paidMinor;

    const paymentStatus =
      paidMinor <= 0
        ? "unpaid"
        : outstandingMinor <= 0
          ? "paid"
          : "partially_paid";

    return {
      id: invoice.id,
      supplierId: invoice.supplierId,
      supplier: invoice.supplier,

      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      paymentTerms: invoice.paymentTerms,
      supplyType: invoice.supplyType,

      subtotal: Number(invoice.subtotal),
      totalAmount: totalMinor / 100,
      paidAmount: paidMinor / 100,
      outstandingAmount: outstandingMinor / 100,

      documentStatus: invoice.status,
      paymentStatus,

      notes: invoice.notes,

      postedAt: invoice.postedAt?.toISOString() ?? null,
      cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),

      items: invoice.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        description: item.description,
        sku: item.sku,
        quantity: item.quantity,
        unitCost: Number(item.unitCost),
        totalCost: Number(item.totalCost),
      })),

      payments: invoice.allocations.map((allocation) => ({
        id: allocation.supplierPayment.id,
        allocationId: allocation.id,
        amount: Number(allocation.amount),
        status: allocation.supplierPayment.status,
        paymentDate: allocation.supplierPayment.paymentDate.toISOString(),
        paymentMethod: allocation.supplierPayment.paymentMethod,
        referenceNumber: allocation.supplierPayment.referenceNumber,
      })),
    };
  });

  return NextResponse.json({ invoices: rows });
}

export async function POST(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  try {
    const body = (await req.json()) as {
      supplierId?: string;
      invoiceNumber?: string | null;
      invoiceDate?: string;
      dueDate?: string | null;
      paymentTerms?: string | null;
      supplyType?: string | null;
      notes?: string | null;
      items?: Array<{
        productId?: string | null;
        variantId?: string | null;
        description?: string | null;
        quantity?: number;
        unitCost?: number;
      }>;
    };

    if (!body.supplierId?.trim()) {
      return NextResponse.json({ error: "المورد مطلوب" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || !body.items.length) {
      return NextResponse.json(
        { error: "يجب إضافة بند واحد على الأقل للفاتورة" },
        { status: 400 },
      );
    }

    const invoice = await createPurchaseInvoiceDraft({
      supplierId: body.supplierId.trim(),
      invoiceNumber: body.invoiceNumber ?? null,
      invoiceDate: parseDate(body.invoiceDate, "تاريخ الفاتورة"),
      dueDate: nullableDate(body.dueDate, "تاريخ الاستحقاق"),
      paymentTerms: body.paymentTerms ?? null,
      supplyType: body.supplyType ?? "purchase",
      notes: body.notes ?? null,
      createdByUserId: userId,

      items: body.items.map((item) => ({
        productId: item.productId ? String(item.productId) : null,
        variantId: item.variantId ? String(item.variantId) : null,
        description: item.description == null ? null : String(item.description),
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
      })),
    });

    await logAudit({
      action: "create_purchase_invoice",
      targetType: "PurchaseInvoice",
      targetId: invoice.id,
    });

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        status: invoice.status,
        totalAmount: Number(invoice.totalAmount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: message(error, "تعذر إنشاء فاتورة المورد") },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  try {
    const body = (await req.json()) as {
      id?: string;
      action?: string;
    };

    if (!body.id?.trim()) {
      return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    }

    if (body.action === "post") {
      const result = await postPurchaseInvoice(body.id.trim(), userId);

      await logAudit({
        action: "post_purchase_invoice",
        targetType: "PurchaseInvoice",
        targetId: body.id.trim(),
      });

      const balance = await getPurchaseInvoiceBalance(body.id.trim());

      return NextResponse.json({
        success: true,
        result,
        balance,
      });
    }

    if (body.action === "cancel") {
      const result = await cancelPurchaseInvoice(body.id.trim(), userId);

      await logAudit({
        action: "cancel_purchase_invoice",
        targetType: "PurchaseInvoice",
        targetId: body.id.trim(),
      });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: message(error, "تعذر تحديث فاتورة المورد") },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "الحذف المباشر غير مسموح. استخدم الإلغاء للحفاظ على السجل المالي.",
    },
    { status: 405 },
  );
}
