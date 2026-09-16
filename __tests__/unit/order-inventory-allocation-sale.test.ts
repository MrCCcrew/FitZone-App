import { describe, expect, it, vi } from "vitest";
import { confirmOrderInventoryAllocationSale } from "@/lib/order-inventory-allocation-service";

describe("confirmOrderInventoryAllocationSale", () => {
  it("sells 5 owned + 2 consignment without mixing consignment into owned stock", async () => {
    const allocationUpdates: any[] = [];

    const tx = {
      orderInventoryAllocation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "owned-a",
            orderItemId: "item-1",
            source: "owned",
            consignmentLotId: null,
            quantity: 5,
            unitCost: null,
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 5,
                reservedStock: 5,
                averageCost: 10,
                trackInventory: true,
              },
            },
          },
          {
            id: "cons-a",
            orderItemId: "item-1",
            source: "consignment",
            consignmentLotId: "lot-1",
            quantity: 2,
            unitCost: 20,
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 5,
                reservedStock: 5,
                averageCost: 10,
                trackInventory: true,
              },
            },
          },
        ]),
        update: vi.fn().mockImplementation(async (args) => {
          allocationUpdates.push(args);
          return {};
        }),
      },

      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "product-1",
          name: "Product",
          stock: 5,
          reservedStock: 5,
          averageCost: 10,
          trackInventory: true,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },

      inventoryMovement: {
        create: vi.fn().mockResolvedValue({ id: "movement-owned" }),
      },

      consignmentLot: {
        findUnique: vi.fn().mockResolvedValue({
          id: "lot-1",
          supplierId: "supplier-1",
          productId: "product-1",
          variantId: null,
          quantityAvailable: 10,
          quantityReserved: 2,
          quantitySold: 0,
          unitCost: 20,
          status: "open",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },

      consignmentMovement: {
        create: vi.fn().mockResolvedValue({ id: "movement-cons" }),
      },

      orderItem: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await confirmOrderInventoryAllocationSale(
      tx as any,
      "order-1"
    );

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "product-1",
        stock: 5,
        reservedStock: 5,
      },
      data: {
        stock: { decrement: 5 },
        reservedStock: { decrement: 5 },
      },
    });

    expect(tx.consignmentLot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          quantityAvailable: { decrement: 2 },
          quantityReserved: { decrement: 2 },
          quantitySold: { increment: 2 },
        },
      })
    );

    expect(tx.consignmentMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "SALE",
        quantityChange: -2,
        quantityBefore: 10,
        quantityAfter: 8,
      }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].ownedQuantity).toBe(5);
    expect(result[0].consignmentQuantity).toBe(2);
    expect(result[0].totalCost).toBe(90);
    expect(result[0].ownedCost).toBe(50);
    expect(result[0].consignmentCost).toBe(40);
    expect(result[0].weightedUnitCost).toBeCloseTo(90 / 7);

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        costPrice: expect.closeTo(90 / 7, 8),
      },
    });

    expect(allocationUpdates).toHaveLength(2);
  });
});
