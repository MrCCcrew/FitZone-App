import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("inventory");
  return "error" in guard ? guard.error : null;
}

type ReceiptItemInput = {
  productId: string;
  quantity: number;
  unitCost: number;
};

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  const receipts = await db.inventoryReceipt.findMany({
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    receipts.map((receipt) => ({
      id: receipt.id,
      referenceNumber: receipt.referenceNumber,
      supplierName: receipt.supplierName,
      notes: receipt.notes,
      receivedAt: receipt.receivedAt.toISOString(),
      totalCost: receipt.totalCost,
      status: receipt.status,
      items: receipt.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
      })),
    })),
  );
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const body = await req.json();
  const items: ReceiptItemInput[] = Array.isArray(body.items) ? body.items : [];

  if (!items.length) {
    return NextResponse.json({ error: "يرجى إضافة منتجات للمشتريات." }, { status: 400 });
  }

  const sanitizedItems = items
    .filter((item) => item?.productId && Number(item.quantity) > 0 && Number(item.unitCost) >= 0)
    .map((item) => ({
      productId: String(item.productId),
      quantity: Math.max(1, Number(item.quantity)),
      unitCost: Math.max(0, Number(item.unitCost)),
    }));

  if (!sanitizedItems.length) {
    return NextResponse.json({ error: "المدخلات غير صحيحة." }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    const receipt = await tx.inventoryReceipt.create({
      data: {
        referenceNumber: body.referenceNumber ? String(body.referenceNumber) : null,
        supplierName: body.supplierName ? String(body.supplierName) : null,
        notes: body.notes ? String(body.notes) : null,
        status: "posted",
        totalCost: 0,
      },
    });

    let totalCost = 0;

    for (const item of sanitizedItems) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        throw new Error("منتج غير موجود في المخزون.");
      }

      const lineTotal = item.unitCost * item.quantity;
      totalCost += lineTotal;

      await tx.inventoryReceiptItem.create({
        data: {
          receiptId: receipt.id,
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: lineTotal,
        },
      });

      const beforeStock = product.stock;
      const afterStock = product.trackInventory ? beforeStock + item.quantity : beforeStock;
      const beforeAvg = product.averageCost ?? 0;
      const newAvg =
        product.trackInventory && afterStock > 0
          ? (beforeAvg * beforeStock + item.unitCost * item.quantity) / afterStock
          : item.unitCost;

      await tx.product.update({
        where: { id: product.id },
        data: {
          stock: product.trackInventory ? afterStock : beforeStock,
          lastPurchaseCost: item.unitCost,
          averageCost: newAvg,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: "purchase",
          quantityChange: item.quantity,
          quantityBefore: beforeStock,
          quantityAfter: afterStock,
          unitCost: item.unitCost,
          averageCostBefore: beforeAvg,
          averageCostAfter: newAvg,
          referenceType: "inventory_receipt",
          referenceId: receipt.id,
          notes: body.notes ? String(body.notes) : null,
        },
      });
    }

    await tx.inventoryReceipt.update({
      where: { id: receipt.id },
      data: { totalCost },
    });

    return receipt.id;
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "تعذر تسجيل المشتريات.";
    return { error: message };
  });

  if (typeof result === "object" && "error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, id: result });
}
