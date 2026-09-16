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

  const payments = await db.supplierPayment.findMany({
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
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

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
    })),
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
    };

    if (!body.supplierId?.trim()) {
      return NextResponse.json({ error: "المورد مطلوب" }, { status: 400 });
    }

    if (!Array.isArray(body.allocations)) {
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

      allocations: body.allocations.map((allocation) => ({
        purchaseInvoiceId: String(allocation.purchaseInvoiceId ?? ""),
        amount: Number(allocation.amount),
      })),
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
