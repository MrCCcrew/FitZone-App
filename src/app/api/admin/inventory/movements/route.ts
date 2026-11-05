import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("inventory");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  const movements = await db.inventoryMovement.findMany({
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(
    movements.map((movement) => ({
      id: movement.id,
      productId: movement.productId,
      productName: movement.product.name,
      type: movement.type,
      quantityChange: movement.quantityChange,
      quantityBefore: movement.quantityBefore,
      quantityAfter: movement.quantityAfter,
      unitCost: movement.unitCost,
      createdAt: movement.createdAt.toISOString(),
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      notes: movement.notes,
    })),
  );
}
