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
      items: { include: { product: true } },
      supplier: true,
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    receipts.map((receipt) => ({
      id: receipt.id,
      referenceNumber: receipt.referenceNumber,
      supplierId: receipt.supplierId ?? null,
      supplierName: receipt.supplier?.name ?? receipt.supplierName ?? null,
      invoiceDate: receipt.invoiceDate?.toISOString() ?? null,
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
    .filter((item) => item?.productId && Number(item.quantity) > 0 && Number(item.unitCost) > 0)
    .map((item) => ({
      productId: String(item.productId),
      quantity: Math.max(1, Number(item.quantity)),
      unitCost: Math.max(0.001, Number(item.unitCost)), // Phase 3: cost must be > 0
    }));

  if (!sanitizedItems.length) {
    return NextResponse.json({ error: "المدخلات غير صحيحة." }, { status: 400 });
  }

  // Phase 3: Check duplicate reference number
  if (body.referenceNumber) {
    const existing = await db.inventoryReceipt.findUnique({
      where: { referenceNumber: String(body.referenceNumber) },
    });
    if (existing) {
      return NextResponse.json(
        { error: `رقم المرجع ${body.referenceNumber} مستخدم بالفعل` },
        { status: 400 }
      );
    }
  }

  // Phase 3: Verify all products exist before transaction
  const productIds = [...new Set(sanitizedItems.map((item) => item.productId))];
  const productsExist = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });

  if (productsExist.length !== productIds.length) {
    return NextResponse.json({ error: "بعض المنتجات غير موجودة" }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    const receipt = await tx.inventoryReceipt.create({
      data: {
        referenceNumber: body.referenceNumber ? String(body.referenceNumber) : null,
        supplierId: body.supplierId ? String(body.supplierId) : null,
        supplierName: body.supplierName ? String(body.supplierName) : null,
        invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : null,
        notes: body.notes ? String(body.notes) : null,
        status: "posted",
        totalCost: 0,
      },
    });

    let totalCost = 0;

    for (const item of sanitizedItems) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error("منتج غير موجود في المخزون.");

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

    await tx.inventoryReceipt.update({ where: { id: receipt.id }, data: { totalCost } });
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

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { id, action } = (await req.json()) as { id?: string; action?: string };

  if (!id) {
    return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  }

  if (action === "void") {
    // Phase 3: Void receipt with reversal movements
    try {
      await db.$transaction(async (tx) => {
        const receipt = await tx.inventoryReceipt.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!receipt) {
          throw new Error("الإيصال غير موجود");
        }

        if (receipt.status === "cancelled") {
          throw new Error("الإيصال ملغى بالفعل");
        }

        if (receipt.status !== "posted") {
          throw new Error("يمكن إلغاء الإيصالات المعتمدة فقط");
        }

        // Check for downstream movements after this receipt (ANY movement that affects WAC/quantity)
        for (const item of receipt.items) {
          const downstreamMovements = await tx.inventoryMovement.count({
            where: {
              productId: item.productId,
              type: { in: ["sale", "return", "adjustment", "purchase"] },
              createdAt: { gt: receipt.receivedAt },
            },
          });

          if (downstreamMovements > 0) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              select: { name: true },
            });
            throw new Error(
              `لا يمكن إلغاء الإيصال: توجد حركات مخزون لاحقة لمنتج "${product?.name}" بعد هذا الإيصال. ` +
              `إلغاء الإيصال سيؤثر على حسابات المخزون والتكلفة.`
            );
          }
        }

        // Create reversal movements
        for (const item of receipt.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { id: true, name: true, stock: true, averageCost: true, trackInventory: true },
          });

          if (!product || !product.trackInventory) continue;

          const stockBefore = product.stock;
          const stockAfter = stockBefore - item.quantity;

          // Safety: check if current stock is sufficient
          if (stockAfter < 0) {
            throw new Error(
              `لا يمكن إلغاء الإيصال: الكمية الحالية لمنتج "${product.name}" (${stockBefore}) ` +
              `غير كافية لعكس الإيصال (${item.quantity} مطلوبة).`
            );
          }

          // Reversal: recalculate WAC removing this receipt's contribution
          // For safety, block void if any downstream movements exist (checked above)
          const avgBefore = product.averageCost;
          let newAvg = avgBefore;

          if (stockAfter > 0) {
            // Remove this receipt's contribution from WAC
            // (stockBefore * avgBefore - qty * unitCost) / stockAfter
            newAvg = (stockBefore * avgBefore - item.quantity * item.unitCost) / stockAfter;

            // Validate calculation (must not be negative)
            if (newAvg < 0) {
              throw new Error(
                `خطأ حسابي: متوسط التكلفة المحسوب سالب لمنتج "${product.name}". ` +
                `قد يكون هناك تعارض في بيانات المخزون.`
              );
            }
          } else {
            // If stock becomes zero, reset avg to 0
            newAvg = 0;
          }

          await tx.product.update({
            where: { id: product.id },
            data: {
              stock: stockAfter,
              averageCost: newAvg,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: product.id,
              type: "adjustment",
              quantityChange: -item.quantity,
              quantityBefore: stockBefore,
              quantityAfter: stockAfter,
              unitCost: item.unitCost,
              averageCostBefore: avgBefore,
              averageCostAfter: newAvg,
              referenceType: "inventory_receipt_void",
              referenceId: receipt.id,
              notes: `إلغاء إيصال شراء #${receipt.referenceNumber ?? receipt.id.slice(-8)}`,
            },
          });
        }

        // Mark receipt as cancelled
        await tx.inventoryReceipt.update({
          where: { id },
          data: { status: "cancelled" },
        });
      }, { timeout: 15000 });

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "تعذر إلغاء الإيصال";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}

// Phase 3: Deprecated - use PATCH with action=void instead
export async function DELETE(req: Request) {
  return NextResponse.json(
    { error: "استخدم PATCH مع action=void لإلغاء الإيصالات" },
    { status: 405 }
  );
}
