import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";
import {
  cancelSupplierPayment,
  createSupplierPaymentDraft,
  postSupplierPayment,
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

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);

  const supplierId = searchParams.get("supplierId")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const outstandingOnly =
    searchParams.get("outstandingOnly") === "1";

  const [payments, consignmentLiabilities] = await Promise.all([
    db.supplierPayment.findMany({
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
      allocations: {
        include: {
          purchaseInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              totalAmount: true,
              status: true,
            },
          },
        },
      },
      consignmentAllocations: {
        include: {
          liability: {
            select: {
              id: true,
              orderId: true,
              grossAmount: true,
              paidAmount: true,
              reversedAmount: true,
              status: true,
              source: true,
            },
          },
        },
      },
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),

    db.consignmentSupplierLiability.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(outstandingOnly
          ? {
              status: {
                in: ["open", "partial"],
              },
            }
          : {}),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: supplierId && outstandingOnly ? undefined : 500,
    }),
  ]);

  return NextResponse.json({
    payments: payments.map((payment) => ({
      id: payment.id,

      supplierId: payment.supplierId,
      supplier: payment.supplier,

      amount: Number(payment.amount),
      paymentDate: payment.paymentDate.toISOString(),
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber,

      status: payment.status,
      notes: payment.notes,

      postedAt: payment.postedAt?.toISOString() ?? null,
      cancelledAt: payment.cancelledAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),

      allocations: payment.allocations.map((allocation) => ({
        id: allocation.id,
        amount: Number(allocation.amount),

        purchaseInvoice: {
          id: allocation.purchaseInvoice.id,
          invoiceNumber: allocation.purchaseInvoice.invoiceNumber,
          invoiceDate: allocation.purchaseInvoice.invoiceDate.toISOString(),
          totalAmount: Number(allocation.purchaseInvoice.totalAmount),
          status: allocation.purchaseInvoice.status,
        },
      })),

      consignmentAllocations: payment.consignmentAllocations.map(
        (allocation) => ({
          id: allocation.id,
          amount: Number(allocation.amount),
          liability: {
            id: allocation.liability.id,
            orderId: allocation.liability.orderId,
            grossAmount: Number(allocation.liability.grossAmount),
            paidAmount: Number(allocation.liability.paidAmount),
            reversedAmount: Number(allocation.liability.reversedAmount),
            status: allocation.liability.status,
            source: allocation.liability.source,
          },
        }),
      ),
    })),

    consignmentLiabilities: consignmentLiabilities.map((liability) => {
      const grossAmount = Number(liability.grossAmount);
      const paidAmount = Number(liability.paidAmount);
      const reversedAmount = Number(liability.reversedAmount);
      const outstandingAmount =
        grossAmount - paidAmount - reversedAmount;

      return {
        id: liability.id,
        supplierId: liability.supplierId,
        supplier: liability.supplier,

        orderId: liability.orderId,
        orderItemId: liability.orderItemId,
        orderInventoryAllocationId:
          liability.orderInventoryAllocationId,

        quantity: liability.quantity,
        unitCost: Number(liability.unitCost),

        grossAmount,
        paidAmount,
        reversedAmount,
        outstandingAmount,

        status: liability.status,
        source: liability.source,
        notes: liability.notes,

        createdAt: liability.createdAt.toISOString(),
        updatedAt: liability.updatedAt.toISOString(),
        reversedAt:
          liability.reversedAt?.toISOString() ?? null,
      };
    }),
  });
}

export async function POST(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  try {
    const body = (await req.json()) as {
      supplierId?: string;
      amount?: number;
      paymentDate?: string;
      paymentMethod?: string;
      referenceNumber?: string | null;
      notes?: string | null;
      allocations?: Array<{
        purchaseInvoiceId?: string;
        amount?: number;
      }>;

      consignmentAllocations?: Array<{
        liabilityId?: string;
        amount?: number;
      }>;
    };

    if (!body.supplierId?.trim()) {
      return NextResponse.json({ error: "المورد مطلوب" }, { status: 400 });
    }

    const invoiceAllocations =
      Array.isArray(body.allocations)
        ? body.allocations
        : [];

    const consignmentAllocations =
      Array.isArray(body.consignmentAllocations)
        ? body.consignmentAllocations
        : [];

    if (
      invoiceAllocations.length === 0 &&
      consignmentAllocations.length === 0
    ) {
      return NextResponse.json(
        { error: "توزيعات الدفعة مطلوبة" },
        { status: 400 },
      );
    }

    const payment = await createSupplierPaymentDraft({
      supplierId: body.supplierId.trim(),
      amount: Number(body.amount),
      paymentDate: parseDate(body.paymentDate, "تاريخ السداد"),
      paymentMethod: String(body.paymentMethod ?? ""),
      referenceNumber: body.referenceNumber ?? null,
      notes: body.notes ?? null,
      createdByUserId: userId,

      allocations: invoiceAllocations.map(
        (allocation) => ({
          purchaseInvoiceId: String(
            allocation.purchaseInvoiceId ?? "",
          ),
          amount: Number(allocation.amount),
        }),
      ),

      consignmentAllocations:
        consignmentAllocations.map(
          (allocation) => ({
            liabilityId: String(
              allocation.liabilityId ?? "",
            ),
            amount: Number(allocation.amount),
          }),
        ),
    });

    await logAudit({
      action: "create_supplier_payment",
      targetType: "SupplierPayment",
      targetId: payment.id,
    });

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: message(error, "تعذر إنشاء دفعة المورد") },
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
      const result = await postSupplierPayment(body.id.trim(), userId);

      await logAudit({
        action: "post_supplier_payment",
        targetType: "SupplierPayment",
        targetId: body.id.trim(),
      });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    if (body.action === "cancel") {
      const result = await cancelSupplierPayment(body.id.trim(), userId);

      await logAudit({
        action: "cancel_supplier_payment",
        targetType: "SupplierPayment",
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
      { error: message(error, "تعذر تحديث دفعة المورد") },
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
