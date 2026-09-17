import { db } from "@/lib/db";

type TransactionClient =
  Parameters<Parameters<typeof db.$transaction>[0]>[0];

type AllocationResult = {
  orderItemId: string;
  productId: string;
  ownedQuantity: number;
  consignmentQuantity: number;
};

export async function reserveOrderInventoryOwnedFirst(
  tx: TransactionClient,
  orderId: string
): Promise<AllocationResult[]> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      id: true,
      productId: true,
      variantId: true,
      quantity: true,
      product: {
        select: {
          id: true,
          name: true,
          stock: true,
          reservedStock: true,
          trackInventory: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  if (items.length === 0) {
    throw new Error(`Order ${orderId} has no items`);
  }

  const existing = await tx.orderInventoryAllocation.count({
    where: {
      orderId,
      status: "reserved",
    },
  });

  if (existing > 0) {
    throw new Error("تم حجز مخزون هذا الطلب مسبقاً");
  }

  const results: AllocationResult[] = [];

  for (const item of items) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        stock: true,
        reservedStock: true,
        trackInventory: true,
      },
    });

    if (!product) {
      throw new Error(
        `المنتج ${item.productId} غير موجود أثناء حجز المخزون`
      );
    }

    if (!product.trackInventory) {
      results.push({
        orderItemId: item.id,
        productId: item.productId,
        ownedQuantity: 0,
        consignmentQuantity: 0,
      });
      continue;
    }

    let remaining = item.quantity;

    // Fresh read is mandatory here because the same product can appear
    // in more than one OrderItem inside the same order.
    const ownedAvailable =
      product.stock - product.reservedStock;

    const ownedQuantity = Math.min(
      remaining,
      Math.max(0, ownedAvailable)
    );

    if (ownedQuantity > 0) {
      const ownedUpdated = await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: product.stock,
          reservedStock: product.reservedStock,
        },
        data: {
          reservedStock: {
            increment: ownedQuantity,
          },
        },
      });

      if (ownedUpdated.count !== 1) {
        throw new Error(
          `تم تغيير المخزون المملوك لـ ${item.product.name} أثناء الحجز`
        );
      }

      await tx.orderInventoryAllocation.create({
        data: {
          orderId,
          orderItemId: item.id,
          source: "owned",
          quantity: ownedQuantity,
          status: "reserved",
        },
      });

      remaining -= ownedQuantity;
    }

    let consignmentQuantity = 0;

    // 2) Remaining quantity may come only from compatible consignment lots.
    //
    // Safety rule:
    // - Order item with variantId -> same variant only.
    // - Order item without variantId -> variant-less lots only.
    //
    // We never guess a variant from size/color text.
    if (remaining > 0) {
      const lots = await tx.consignmentLot.findMany({
        where: {
          productId: item.productId,
          variantId: item.variantId ?? null,
          status: "open",
        },
        select: {
          id: true,
          quantityAvailable: true,
          quantityReserved: true,
          unitCost: true,
          createdAt: true,
        },
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });

      for (const lot of lots) {
        if (remaining <= 0) break;

        const lotAvailable =
          lot.quantityAvailable - lot.quantityReserved;

        if (lotAvailable <= 0) continue;

        const quantity = Math.min(
          remaining,
          lotAvailable
        );

        const updated = await tx.consignmentLot.updateMany({
          where: {
            id: lot.id,
            status: "open",
            quantityAvailable: lot.quantityAvailable,
            quantityReserved: lot.quantityReserved,
          },
          data: {
            quantityReserved: {
              increment: quantity,
            },
          },
        });

        if (updated.count !== 1) {
          throw new Error(
            `تم تغيير مخزون الأمانة لـ ${item.product.name} أثناء الحجز`
          );
        }

        await tx.orderInventoryAllocation.create({
          data: {
            orderId,
            orderItemId: item.id,
            source: "consignment",
            consignmentLotId: lot.id,
            quantity,
            unitCost: lot.unitCost,
            status: "reserved",
          },
        });

        consignmentQuantity += quantity;
        remaining -= quantity;
      }
    }

    if (remaining > 0) {
      throw new Error(
        `المخزون الكلي غير كافٍ لـ ${item.product.name}. الناقص: ${remaining}`
      );
    }

    results.push({
      orderItemId: item.id,
      productId: item.productId,
      ownedQuantity,
      consignmentQuantity,
    });
  }

  return results;
}

export async function releaseOrderInventoryAllocations(
  tx: TransactionClient,
  orderId: string
): Promise<void> {
  const allocations = await tx.orderInventoryAllocation.findMany({
    where: {
      orderId,
      status: "reserved",
    },
    select: {
      id: true,
      source: true,
      quantity: true,
      consignmentLotId: true,
      orderItem: {
        select: {
          productId: true,
          product: {
            select: {
              name: true,
              stock: true,
              reservedStock: true,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  for (const allocation of allocations) {
    if (allocation.source === "owned") {
      const product = await tx.product.findUnique({
        where: {
          id: allocation.orderItem.productId,
        },
        select: {
          id: true,
          name: true,
          stock: true,
          reservedStock: true,
        },
      });

      if (!product) {
        throw new Error(
          `المنتج ${allocation.orderItem.productId} غير موجود أثناء تحرير الحجز`
        );
      }

      if (product.reservedStock < allocation.quantity) {
        throw new Error(
          `حجز المخزون المملوك غير صالح لـ ${product.name}`
        );
      }

      const updated = await tx.product.updateMany({
        where: {
          id: allocation.orderItem.productId,
          stock: product.stock,
          reservedStock: product.reservedStock,
        },
        data: {
          reservedStock: {
            decrement: allocation.quantity,
          },
        },
      });

      if (updated.count !== 1) {
        throw new Error(
          `تم تغيير المخزون المملوك أثناء تحرير الحجز`
        );
      }
    } else if (allocation.source === "consignment") {
      if (!allocation.consignmentLotId) {
        throw new Error(
          `Consignment allocation ${allocation.id} has no lot`
        );
      }

      const lot = await tx.consignmentLot.findUnique({
        where: { id: allocation.consignmentLotId },
        select: {
          id: true,
          quantityAvailable: true,
          quantityReserved: true,
          status: true,
        },
      });

      if (!lot || lot.quantityReserved < allocation.quantity) {
        throw new Error(
          `حجز مخزون الأمانة غير صالح`
        );
      }

      const updated = await tx.consignmentLot.updateMany({
        where: {
          id: lot.id,
          quantityAvailable: lot.quantityAvailable,
          quantityReserved: lot.quantityReserved,
          status: lot.status,
        },
        data: {
          quantityReserved: {
            decrement: allocation.quantity,
          },
        },
      });

      if (updated.count !== 1) {
        throw new Error(
          `تم تغيير مخزون الأمانة أثناء تحرير الحجز`
        );
      }
    } else {
      throw new Error(
        `Unknown inventory allocation source: ${allocation.source}`
      );
    }

    await tx.orderInventoryAllocation.update({
      where: { id: allocation.id },
      data: { status: "released" },
    });
  }
}

export type AllocationSaleResult = {
  orderItemId: string;
  productId: string;
  quantity: number;
  ownedQuantity: number;
  consignmentQuantity: number;
  totalCost: number;
  ownedCost: number;
  consignmentCost: number;
  weightedUnitCost: number;
};

export async function confirmOrderInventoryAllocationSale(
  tx: TransactionClient,
  orderId: string
): Promise<AllocationSaleResult[]> {
  const allocations = await tx.orderInventoryAllocation.findMany({
    where: {
      orderId,
      status: "reserved",
    },
    select: {
      id: true,
      orderItemId: true,
      source: true,
      consignmentLotId: true,
      quantity: true,
      unitCost: true,
      orderItem: {
        select: {
          productId: true,
          product: {
            select: {
              name: true,
              stock: true,
              reservedStock: true,
              averageCost: true,
              trackInventory: true,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  if (allocations.length === 0) {
    throw new Error(
      `لا توجد حجوزات مخزون قابلة للتحويل للطلب ${orderId}`
    );
  }

  const itemTotals = new Map<
    string,
    {
      productId: string;
      quantity: number;
      ownedQuantity: number;
      consignmentQuantity: number;
      totalCost: number;
      ownedCost: number;
      consignmentCost: number;
    }
  >();

  for (const allocation of allocations) {
    const product = await tx.product.findUnique({
      where: {
        id: allocation.orderItem.productId,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        reservedStock: true,
        averageCost: true,
        trackInventory: true,
      },
    });

    if (!product) {
      throw new Error(
        `المنتج ${allocation.orderItem.productId} غير موجود أثناء تأكيد البيع`
      );
    }

    if (!product.trackInventory) {
      throw new Error(
        `Unexpected allocation for non-tracked product ${allocation.orderItem.productId}`
      );
    }

    let unitCost = 0;

    if (allocation.source === "owned") {
      if (
        product.reservedStock < allocation.quantity ||
        product.stock < allocation.quantity
      ) {
        throw new Error(
          `المخزون المملوك المحجوز غير كافٍ لـ ${product.name}`
        );
      }

      unitCost = Number(product.averageCost);

      const updated = await tx.product.updateMany({
        where: {
          id: allocation.orderItem.productId,
          stock: product.stock,
          reservedStock: product.reservedStock,
        },
        data: {
          stock: {
            decrement: allocation.quantity,
          },
          reservedStock: {
            decrement: allocation.quantity,
          },
        },
      });

      if (updated.count !== 1) {
        throw new Error(
          `تم تغيير المخزون المملوك لـ ${product.name} أثناء تأكيد البيع`
        );
      }

      await tx.inventoryMovement.create({
        data: {
          productId: allocation.orderItem.productId,
          type: "sale",
          quantityChange: -allocation.quantity,
          quantityBefore: product.stock,
          quantityAfter: product.stock - allocation.quantity,
          unitCost,
          averageCostBefore: product.averageCost,
          averageCostAfter: product.averageCost,
          referenceType: "Order",
          referenceId: orderId,
          reason: `بيع مخزون مملوك - Allocation ${allocation.id}`,
        },
      });

      await tx.orderInventoryAllocation.update({
        where: { id: allocation.id },
        data: {
          status: "sold",
          unitCost,
        },
      });
    } else if (allocation.source === "consignment") {
      if (!allocation.consignmentLotId) {
        throw new Error(
          `Consignment allocation ${allocation.id} has no lot`
        );
      }

      const lot = await tx.consignmentLot.findUnique({
        where: {
          id: allocation.consignmentLotId,
        },
        select: {
          id: true,
          supplierId: true,
          productId: true,
          variantId: true,
          quantityAvailable: true,
          quantityReserved: true,
          quantitySold: true,
          unitCost: true,
          status: true,
        },
      });

      if (
        !lot ||
        lot.quantityReserved < allocation.quantity ||
        lot.quantityAvailable < allocation.quantity
      ) {
        throw new Error(
          `مخزون الأمانة المحجوز غير كافٍ لـ ${product.name}`
        );
      }

      unitCost = Number(lot.unitCost);

      const afterAvailable =
        lot.quantityAvailable - allocation.quantity;

      const updated = await tx.consignmentLot.updateMany({
        where: {
          id: lot.id,
          quantityAvailable: lot.quantityAvailable,
          quantityReserved: lot.quantityReserved,
          quantitySold: lot.quantitySold,
          status: lot.status,
        },
        data: {
          quantityAvailable: {
            decrement: allocation.quantity,
          },
          quantityReserved: {
            decrement: allocation.quantity,
          },
          quantitySold: {
            increment: allocation.quantity,
          },
          ...(afterAvailable === 0
            ? { status: "depleted" }
            : {}),
        },
      });

      if (updated.count !== 1) {
        throw new Error(
          `تم تغيير مخزون الأمانة لـ ${product.name} أثناء تأكيد البيع`
        );
      }

      await tx.consignmentMovement.create({
        data: {
          lotId: lot.id,
          supplierId: lot.supplierId,
          productId: lot.productId,
          variantId: lot.variantId,
          type: "SALE",
          quantityChange: -allocation.quantity,
          quantityBefore: lot.quantityAvailable,
          quantityAfter: afterAvailable,
          unitCost: lot.unitCost,
          referenceType: "OrderInventoryAllocation",
          referenceId: allocation.id,
          reason: `بيع أمانة - طلب #${orderId.slice(-8)}`,
        },
      });

      const liabilityAmount =
        allocation.quantity * Number(lot.unitCost);

      await tx.consignmentSupplierLiability.create({
        data: {
          supplierId: lot.supplierId,
          orderId,
          orderItemId: allocation.orderItemId,
          orderInventoryAllocationId: allocation.id,
          quantity: allocation.quantity,
          unitCost: lot.unitCost,
          grossAmount: liabilityAmount,
          paidAmount: 0,
          reversedAmount: 0,
          status: "open",
          source: "sale",
          notes: `مستحق مورد أمانات - طلب #${orderId.slice(-8)}`,
        },
      });

      await tx.orderInventoryAllocation.update({
        where: { id: allocation.id },
        data: {
          status: "sold",
          unitCost: lot.unitCost,
        },
      });
    } else {
      throw new Error(
        `Unknown inventory allocation source: ${allocation.source}`
      );
    }

    const current = itemTotals.get(allocation.orderItemId) ?? {
      productId: allocation.orderItem.productId,
      quantity: 0,
      ownedQuantity: 0,
      consignmentQuantity: 0,
      totalCost: 0,
      ownedCost: 0,
      consignmentCost: 0,
    };

    current.quantity += allocation.quantity;
    current.totalCost += allocation.quantity * unitCost;

    if (allocation.source === "owned") {
      current.ownedQuantity += allocation.quantity;
      current.ownedCost += allocation.quantity * unitCost;
    } else {
      current.consignmentQuantity += allocation.quantity;
      current.consignmentCost += allocation.quantity * unitCost;
    }

    itemTotals.set(allocation.orderItemId, current);
  }

  const results: AllocationSaleResult[] = [];

  for (const [orderItemId, data] of itemTotals) {
    const weightedUnitCost =
      data.quantity > 0
        ? data.totalCost / data.quantity
        : 0;

    await tx.orderItem.update({
      where: { id: orderItemId },
      data: {
        costPrice: weightedUnitCost,
      },
    });

    results.push({
      orderItemId,
      productId: data.productId,
      quantity: data.quantity,
      ownedQuantity: data.ownedQuantity,
      consignmentQuantity: data.consignmentQuantity,
      totalCost: data.totalCost,
      ownedCost: data.ownedCost,
      consignmentCost: data.consignmentCost,
      weightedUnitCost,
    });
  }

  return results;
}

export type AllocationReturnResult = {
  orderItemId: string;
  productId: string;
  quantity: number;
  ownedQuantity: number;
  consignmentQuantity: number;
  totalCost: number;
  ownedCost: number;
  consignmentCost: number;
};

export async function returnOrderInventoryAllocations(
  tx: TransactionClient,
  orderId: string
): Promise<AllocationReturnResult[]> {
  const allocations =
    await tx.orderInventoryAllocation.findMany({
      where: {
        orderId,
        status: "sold",
      },
      select: {
        id: true,
        orderItemId: true,
        source: true,
        consignmentLotId: true,
        quantity: true,
        unitCost: true,
        orderItem: {
          select: {
            productId: true,
            product: {
              select: {
                id: true,
                name: true,
                stock: true,
                averageCost: true,
                trackInventory: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });

  if (allocations.length === 0) {
    throw new Error(
      `لا توجد مبيعات مخزون قابلة للإرجاع للطلب ${orderId}`
    );
  }

  const totals = new Map<
    string,
    {
      productId: string;
      quantity: number;
      ownedQuantity: number;
      consignmentQuantity: number;
      totalCost: number;
      ownedCost: number;
      consignmentCost: number;
    }
  >();

  for (const allocation of allocations) {
    const product = await tx.product.findUnique({
      where: {
        id: allocation.orderItem.productId,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        averageCost: true,
        trackInventory: true,
      },
    });

    if (!product) {
      throw new Error(
        `المنتج ${allocation.orderItem.productId} غير موجود أثناء المرتجع`
      );
    }

    const unitCost = Number(allocation.unitCost ?? 0);

    if (!product.trackInventory) {
      throw new Error(
        `Unexpected sold allocation for non-tracked product ${allocation.orderItem.productId}`
      );
    }

    if (allocation.source === "owned") {
      const stockBefore = product.stock;
      const stockAfter =
        stockBefore + allocation.quantity;

      const avgBefore =
        Number(product.averageCost);

      const returnedCost =
        allocation.quantity * unitCost;

      const newAverageCost =
        stockAfter > 0
          ? (
              stockBefore * avgBefore +
              returnedCost
            ) / stockAfter
          : unitCost;

      const updated = await tx.product.updateMany({
        where: {
          id: allocation.orderItem.productId,
          stock: product.stock,
          averageCost: product.averageCost,
        },
        data: {
          stock: {
            increment: allocation.quantity,
          },
          averageCost: newAverageCost,
        },
      });

      if (updated.count !== 1) {
        throw new Error(
          `تم تغيير المخزون المملوك لـ ${product.name} أثناء المرتجع`
        );
      }

      await tx.inventoryMovement.create({
        data: {
          productId: allocation.orderItem.productId,
          type: "return",
          quantityChange: allocation.quantity,
          quantityBefore: stockBefore,
          quantityAfter: stockAfter,
          unitCost,
          averageCostBefore: avgBefore,
          averageCostAfter: newAverageCost,
          referenceType: "OrderInventoryAllocation",
          referenceId: allocation.id,
          reason:
            `مرتجع مخزون مملوك - طلب #${orderId.slice(-8)}`,
        },
      });
    } else if (allocation.source === "consignment") {
      if (!allocation.consignmentLotId) {
        throw new Error(
          `Consignment allocation ${allocation.id} has no lot`
        );
      }

      const lot =
        await tx.consignmentLot.findUnique({
          where: {
            id: allocation.consignmentLotId,
          },
          select: {
            id: true,
            supplierId: true,
            productId: true,
            variantId: true,
            quantityAvailable: true,
            quantityReserved: true,
            quantitySold: true,
            unitCost: true,
            status: true,
          },
        });

      if (
        !lot ||
        lot.quantitySold < allocation.quantity
      ) {
        throw new Error(
          `الكمية المباعة من الأمانة غير كافية للمرتجع`
        );
      }

      const beforeAvailable =
        lot.quantityAvailable;

      const afterAvailable =
        beforeAvailable + allocation.quantity;

      const updated =
        await tx.consignmentLot.updateMany({
          where: {
            id: lot.id,
            quantityAvailable:
              lot.quantityAvailable,
            quantityReserved:
              lot.quantityReserved,
            quantitySold:
              lot.quantitySold,
            status:
              lot.status,
          },
          data: {
            quantityAvailable: {
              increment: allocation.quantity,
            },
            quantitySold: {
              decrement: allocation.quantity,
            },
            status: "open",
          },
        });

      if (updated.count !== 1) {
        throw new Error(
          `تم تغيير مخزون الأمانة أثناء المرتجع`
        );
      }

      await tx.consignmentMovement.create({
        data: {
          lotId: lot.id,
          supplierId: lot.supplierId,
          productId: lot.productId,
          variantId: lot.variantId,
          type: "SALE_REVERSAL",
          quantityChange: allocation.quantity,
          quantityBefore: beforeAvailable,
          quantityAfter: afterAvailable,
          unitCost: lot.unitCost,
          referenceType:
            "OrderInventoryAllocation",
          referenceId: allocation.id,
          reason:
            `عكس بيع أمانة - طلب #${orderId.slice(-8)}`,
        },
      });

      const liability =
        await tx.consignmentSupplierLiability.findUnique({
          where: {
            orderInventoryAllocationId:
              allocation.id,
          },
          select: {
            id: true,
            grossAmount: true,
            paidAmount: true,
            reversedAmount: true,
          },
        });

      if (!liability) {
        throw new Error(
          `Consignment liability missing for allocation ${allocation.id}`
        );
      }

      const grossAmount =
        Number(liability.grossAmount);

      const paidAmount =
        Number(liability.paidAmount);

      const reversedAmount =
        Number(liability.reversedAmount);

      if (reversedAmount > 0) {
        throw new Error(
          `Consignment liability already reversed for allocation ${allocation.id}`
        );
      }

      await tx.consignmentSupplierLiability.update({
        where: {
          id: liability.id,
        },
        data: {
          reversedAmount: grossAmount,
          reversedAt: new Date(),
          status:
            paidAmount > 0
              ? "credit"
              : "reversed",
        },
      });
    } else {
      throw new Error(
        `Unknown inventory allocation source: ${allocation.source}`
      );
    }

    await tx.orderInventoryAllocation.update({
      where: {
        id: allocation.id,
      },
      data: {
        status: "returned",
      },
    });

    const current =
      totals.get(allocation.orderItemId) ?? {
        productId:
          allocation.orderItem.productId,
        quantity: 0,
        ownedQuantity: 0,
        consignmentQuantity: 0,
        totalCost: 0,
        ownedCost: 0,
        consignmentCost: 0,
      };

    const allocationCost =
      allocation.quantity * unitCost;

    current.quantity += allocation.quantity;
    current.totalCost += allocationCost;

    if (allocation.source === "owned") {
      current.ownedQuantity +=
        allocation.quantity;
      current.ownedCost +=
        allocationCost;
    } else {
      current.consignmentQuantity +=
        allocation.quantity;
      current.consignmentCost +=
        allocationCost;
    }

    totals.set(
      allocation.orderItemId,
      current
    );
  }

  return Array.from(
    totals.entries()
  ).map(([orderItemId, row]) => ({
    orderItemId,
    ...row,
  }));
}
