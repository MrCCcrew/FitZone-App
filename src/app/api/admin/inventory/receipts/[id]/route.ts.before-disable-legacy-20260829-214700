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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const err = await checkAdmin();
  if (err) return err;

  const { id } = await params;

  const receipt = await db.inventoryReceipt.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!receipt) {
    return NextResponse.json({ error: "الفاتورة غير موجودة." }, { status: 404 });
  }

  const result = await db
    .$transaction(async (tx) => {
      /** Replay remaining purchase movements → return correct WAC */
      const recalcWAC = async (productId: string) => {
        const purchases = await tx.inventoryMovement.findMany({
          where: { productId, type: "purchase" },
          orderBy: { createdAt: "asc" },
        });
        let avgCost = 0, runningStock = 0, lastPurchaseCost = 0;
        for (const m of purchases) {
          const ns = runningStock + m.quantityChange;
          avgCost = ns > 0
            ? (avgCost * runningStock + (m.unitCost ?? 0) * m.quantityChange) / ns
            : (m.unitCost ?? 0);
          runningStock = ns;
          lastPurchaseCost = m.unitCost ?? 0;
        }
        return { avgCost, lastPurchaseCost };
      };

      // Reverse stock
      for (const item of receipt.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;
        if (product.trackInventory) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }
      }

      // Delete movements for this receipt
      await tx.inventoryMovement.deleteMany({
        where: { referenceType: "inventory_receipt", referenceId: receipt.id },
      });

      // Recalculate WAC from remaining purchase movements
      const affected = [...new Set(receipt.items.map((i) => i.productId))];
      for (const productId of affected) {
        const { avgCost, lastPurchaseCost } = await recalcWAC(productId);
        await tx.product.update({
          where: { id: productId },
          data: { averageCost: avgCost, lastPurchaseCost },
        });
      }

      // Delete receipt (cascades to items)
      await tx.inventoryReceipt.delete({ where: { id: receipt.id } });
    })
    .catch((error: unknown) => ({
      error: error instanceof Error ? error.message : "تعذر حذف الفاتورة.",
    }));

  if (result && typeof result === "object" && "error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const err = await checkAdmin();
  if (err) return err;

  const { id } = await params;

  const receipt = await db.inventoryReceipt.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!receipt) {
    return NextResponse.json({ error: "الفاتورة غير موجودة." }, { status: 404 });
  }

  const body = await req.json();
  const rawItems: ReceiptItemInput[] = Array.isArray(body.items) ? body.items : [];

  const sanitizedItems = rawItems
    .filter((item) => item?.productId && Number(item.quantity) > 0 && Number(item.unitCost) >= 0)
    .map((item) => ({
      productId: String(item.productId),
      quantity: Math.max(1, Number(item.quantity)),
      unitCost: Math.max(0, Number(item.unitCost)),
    }));

  if (!sanitizedItems.length) {
    return NextResponse.json({ error: "يرجى إضافة منتجات للمشتريات." }, { status: 400 });
  }

  const result = await db
    .$transaction(async (tx) => {
      /** Replay remaining purchase movements → return correct WAC */
      const recalcWAC = async (productId: string) => {
        const purchases = await tx.inventoryMovement.findMany({
          where: { productId, type: "purchase" },
          orderBy: { createdAt: "asc" },
        });
        let avgCost = 0, runningStock = 0, lastPurchaseCost = 0;
        for (const m of purchases) {
          const ns = runningStock + m.quantityChange;
          avgCost = ns > 0
            ? (avgCost * runningStock + (m.unitCost ?? 0) * m.quantityChange) / ns
            : (m.unitCost ?? 0);
          runningStock = ns;
          lastPurchaseCost = m.unitCost ?? 0;
        }
        return { avgCost, lastPurchaseCost };
      };

      // Step 1: Reverse old items' stock
      for (const item of receipt.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;
        if (product.trackInventory) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }
      }

      // Step 2: Delete old movements and receipt items
      await tx.inventoryMovement.deleteMany({
        where: { referenceType: "inventory_receipt", referenceId: receipt.id },
      });
      await tx.inventoryReceiptItem.deleteMany({ where: { receiptId: receipt.id } });

      // Step 3: Recalculate WAC for previously-affected products
      const oldProductIds = [...new Set(receipt.items.map((i) => i.productId))];
      for (const productId of oldProductIds) {
        const { avgCost, lastPurchaseCost } = await recalcWAC(productId);
        await tx.product.update({
          where: { id: productId },
          data: { averageCost: avgCost, lastPurchaseCost },
        });
      }

      // Step 4: Apply new items
      let totalCost = 0;
      for (const item of sanitizedItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error("منتج غير موجود في المخزون.");

        const lineTotal = item.unitCost * item.quantity;
        totalCost += lineTotal;

        const beforeStock = product.stock;
        const afterStock = product.trackInventory ? beforeStock + item.quantity : beforeStock;
        const beforeAvg = product.averageCost ?? 0;
        const newAvg =
          product.trackInventory && afterStock > 0
            ? (beforeAvg * beforeStock + item.unitCost * item.quantity) / afterStock
            : item.unitCost;

        await tx.inventoryReceiptItem.create({
          data: {
            receiptId: receipt.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalCost: lineTotal,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: product.trackInventory ? afterStock : beforeStock,
            lastPurchaseCost: item.unitCost,
            averageCost: newAvg,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
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

      // Step 5: Update receipt header
      await tx.inventoryReceipt.update({
        where: { id: receipt.id },
        data: {
          referenceNumber: body.referenceNumber !== undefined
            ? (body.referenceNumber ? String(body.referenceNumber) : null)
            : receipt.referenceNumber,
          supplierName: body.supplierName !== undefined
            ? (body.supplierName ? String(body.supplierName) : null)
            : receipt.supplierName,
          notes: body.notes !== undefined
            ? (body.notes ? String(body.notes) : null)
            : receipt.notes,
          totalCost,
        },
      });
    })
    .catch((error: unknown) => ({
      error: error instanceof Error ? error.message : "تعذر تعديل الفاتورة.",
    }));

  if (result && typeof result === "object" && "error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
