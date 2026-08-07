import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

type AdjustmentType = "increase" | "decrease";

interface CalculationResult {
  quantityAfter: number;
  averageCostAfter: number;
  quantityChange: number;
  unitCostFinal: number;
}

function calculateAdjustment(
  product: { stock: number; averageCost: number },
  type: AdjustmentType,
  quantity: number,
  unitCost?: number
): CalculationResult {
  const qty = quantity;

  if (type === "increase") {
    const cost = unitCost!; // Already validated
    const oldQty = product.stock;
    const oldAvg = product.averageCost;
    const newQty = oldQty + qty;

    // Moving Weighted Average formula
    const newAvg = newQty > 0 ? (oldQty * oldAvg + qty * cost) / newQty : cost;

    return {
      quantityAfter: newQty,
      averageCostAfter: newAvg,
      quantityChange: qty, // positive
      unitCostFinal: cost,
    };
  } else {
    // decrease
    const newQty = product.stock - qty;

    return {
      quantityAfter: newQty,
      averageCostAfter: product.averageCost, // unchanged
      quantityChange: -qty, // negative
      unitCostFinal: product.averageCost, // exit at current average
    };
  }
}

export async function POST(req: Request) {
  // 1. Check permissions
  const guard = await requireAdminFeature("inventory");
  if ("error" in guard) return guard.error;

  try {
    // 2. Parse request
    const body = await req.json();
    const { productId, type, quantity, unitCost, reason, notes } = body;

    // 3. Validate productId
    if (typeof productId !== "string" || productId.trim() === "") {
      return NextResponse.json(
        { error: "معرّف المنتج مطلوب ويجب أن يكون نص صحيح." },
        { status: 400 }
      );
    }

    // 4. Validate type
    if (type !== "increase" && type !== "decrease") {
      return NextResponse.json(
        { error: "نوع التسوية يجب أن يكون increase أو decrease." },
        { status: 400 }
      );
    }

    // 5. Validate quantity
    const qty = Number(quantity);
    if (!Number.isFinite(qty)) {
      return NextResponse.json(
        { error: "الكمية يجب أن تكون رقم صحيح." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(qty)) {
      return NextResponse.json(
        { error: "يجب أن تكون الكمية عددًا صحيحًا موجبًا." },
        { status: 400 }
      );
    }

    if (qty <= 0) {
      return NextResponse.json(
        { error: "يجب أن تكون الكمية عددًا صحيحًا موجبًا." },
        { status: 400 }
      );
    }

    // 6. Validate reason
    if (typeof reason !== "string") {
      return NextResponse.json(
        { error: "سبب التسوية مطلوب ويجب أن يكون نص." },
        { status: 400 }
      );
    }

    if (reason.trim().length === 0) {
      return NextResponse.json(
        { error: "يجب إدخال سبب التسوية." },
        { status: 400 }
      );
    }

    // 7. Validate notes (if provided)
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return NextResponse.json(
        { error: "الملاحظات يجب أن تكون نص." },
        { status: 400 }
      );
    }

    // 8. Validate unitCost for increase
    if (type === "increase") {
      if (unitCost == null) {
        return NextResponse.json(
          { error: "يجب إدخال تكلفة الوحدة عند زيادة المخزون." },
          { status: 400 }
        );
      }

      const cost = Number(unitCost);
      if (!Number.isFinite(cost)) {
        return NextResponse.json(
          { error: "تكلفة الوحدة يجب أن تكون رقم صحيح." },
          { status: 400 }
        );
      }

      if (cost <= 0) {
        return NextResponse.json(
          { error: "تكلفة الوحدة يجب أن تكون رقم موجب." },
          { status: 400 }
        );
      }
    }

    // 9. Execute in transaction with Optimistic Concurrency
    const result = await db.$transaction(async (tx) => {
      // 9a. Read current product state
      const product = await tx.product.findUnique({
        where: { id: String(productId) },
        select: {
          id: true,
          name: true,
          stock: true,
          averageCost: true,
          lastPurchaseCost: true,
        },
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      // 9b. Check stock availability for decrease
      if (type === "decrease" && qty > product.stock) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      // 9c. Calculate new values (ignore unitCost for decrease)
      const calculation = calculateAdjustment(
        product,
        type,
        qty,
        type === "increase" ? Number(unitCost) : undefined
      );

      // 9d. Update product with optimistic concurrency control
      const updated = await tx.product.updateMany({
        where: {
          id: product.id,
          stock: product.stock, // ← Condition on current state
          averageCost: product.averageCost, // ← Condition on current state
        },
        data: {
          stock: calculation.quantityAfter,
          averageCost: calculation.averageCostAfter,
        },
      });

      // 9e. Check if update succeeded
      if (updated.count !== 1) {
        throw new Error("STOCK_CHANGED");
      }

      // 9f. Create inventory movement (after successful update)
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: "adjustment",
          quantityChange: calculation.quantityChange,
          quantityBefore: product.stock,
          quantityAfter: calculation.quantityAfter,
          unitCost: calculation.unitCostFinal,
          averageCostBefore: product.averageCost,
          averageCostAfter: calculation.averageCostAfter,
          referenceType: "manual",
          referenceId: null,
          reason: reason.trim(),
          notes: notes ? String(notes).trim() : null,
          performedByUserId: guard.session.user.id,
        },
      });

      return {
        movement: {
          id: movement.id,
          productId: movement.productId,
          type: movement.type,
          quantityChange: movement.quantityChange,
          quantityBefore: movement.quantityBefore,
          quantityAfter: movement.quantityAfter,
          unitCost: movement.unitCost,
          averageCostBefore: movement.averageCostBefore,
          averageCostAfter: movement.averageCostAfter,
          reason: movement.reason,
          createdAt: movement.createdAt.toISOString(),
        },
        product: {
          id: product.id,
          name: product.name,
          stock: calculation.quantityAfter,
          averageCost: calculation.averageCostAfter,
        },
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "PRODUCT_NOT_FOUND":
          return NextResponse.json({ error: "المنتج غير موجود." }, { status: 404 });

        case "STOCK_CHANGED":
          return NextResponse.json(
            { error: "تغير المخزون أثناء تنفيذ التسوية. يرجى إعادة المحاولة." },
            { status: 409 }
          );

        case "INSUFFICIENT_STOCK":
          return NextResponse.json(
            { error: "الكمية المطلوبة أكبر من المخزون المتاح." },
            { status: 422 }
          );

        default:
          console.error("[INVENTORY_ADJUSTMENT]", error);
          return NextResponse.json(
            { error: "حدث خطأ أثناء تنفيذ التسوية." },
            { status: 500 }
          );
      }
    }

    console.error("[INVENTORY_ADJUSTMENT]", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع." }, { status: 500 });
  }
}
