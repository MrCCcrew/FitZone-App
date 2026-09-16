import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit-context";
import { db } from "@/lib/db";
import { createConsignmentReceipt } from "@/lib/consignment-inventory-service";

async function checkAdmin() {
  const guard = await requireAdminFeature("inventory");

  return "error" in guard
    ? { error: guard.error, userId: null }
    : { error: null, userId: guard.session.user.id };
}

export async function GET() {
  const { error } = await checkAdmin();
  if (error) return error;

  const receipts = await db.consignmentReceipt.findMany({
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      purchaseInvoice: {
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          supplyType: true,
          status: true,
        },
      },
      lots: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
          variant: {
            select: {
              id: true,
              size: true,
              color: true,
              sku: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      receivedAt: "desc",
    },
    take: 100,
  });

  return NextResponse.json(
    receipts.map((receipt) => ({
      id: receipt.id,
      referenceNumber: receipt.referenceNumber,
      supplierId: receipt.supplierId,
      supplierName: receipt.supplier.name,
      supplierCode: receipt.supplier.code,
      purchaseInvoiceId: receipt.purchaseInvoiceId,
      purchaseInvoice: receipt.purchaseInvoice
        ? {
            id: receipt.purchaseInvoice.id,
            invoiceNumber: receipt.purchaseInvoice.invoiceNumber,
            invoiceDate: receipt.purchaseInvoice.invoiceDate.toISOString(),
            supplyType: receipt.purchaseInvoice.supplyType,
            status: receipt.purchaseInvoice.status,
          }
        : null,
      receivedAt: receipt.receivedAt.toISOString(),
      status: receipt.status,
      totalDeclaredCost: Number(receipt.totalDeclaredCost),
      notes: receipt.notes,
      lots: receipt.lots.map((lot) => ({
        id: lot.id,
        productId: lot.productId,
        productName: lot.product.name,
        variantId: lot.variantId,
        variant: lot.variant
          ? {
              id: lot.variant.id,
              size: lot.variant.size,
              color: lot.variant.color,
              sku: lot.variant.sku,
            }
          : null,
        sku: lot.sku,
        quantityReceived: lot.quantityReceived,
        quantityAvailable: lot.quantityAvailable,
        quantitySold: lot.quantitySold,
        quantityReturned: lot.quantityReturned,
        unitCost: Number(lot.unitCost),
        status: lot.status,
      })),
    })),
  );
}

export async function POST(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  try {
    const body = (await req.json()) as {
      supplierId?: string;
      purchaseInvoiceId?: string | null;
      referenceNumber?: string | null;
      receivedAt?: string | null;
      notes?: string | null;
      items?: Array<{
        productId?: string;
        variantId?: string | null;
        quantity?: number;
        unitCost?: number;
      }>;
    };

    if (!body.supplierId?.trim()) {
      return NextResponse.json({ error: "المورد مطلوب" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "يجب إضافة منتج واحد على الأقل" },
        { status: 400 },
      );
    }

    const receivedAt = body.receivedAt ? new Date(body.receivedAt) : null;

    if (receivedAt && Number.isNaN(receivedAt.getTime())) {
      return NextResponse.json(
        { error: "تاريخ الاستلام غير صالح" },
        { status: 400 },
      );
    }

    const receipt = await createConsignmentReceipt({
      supplierId: body.supplierId,
      purchaseInvoiceId: body.purchaseInvoiceId ?? null,
      referenceNumber: body.referenceNumber ?? null,
      receivedAt,
      notes: body.notes ?? null,
      performedByUserId: userId,
      items: body.items.map((item) => ({
        productId: String(item.productId ?? ""),
        variantId: item.variantId ?? null,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
      })),
    });

    if (!receipt) {
      throw new Error("Consignment receipt was not created");
    }

    await logAudit({
      action: "create_consignment_receipt",
      targetType: "ConsignmentReceipt",
      targetId: receipt.id,
      details: {
        supplierId: receipt.supplierId,
        purchaseInvoiceId: receipt.purchaseInvoiceId,
        referenceNumber: receipt.referenceNumber,
        lotCount: receipt.lots.length,
        totalDeclaredCost: Number(receipt.totalDeclaredCost),
      },
    });

    return NextResponse.json({
      success: true,
      id: receipt.id,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "تعذر تسجيل استلام الأمانات";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
