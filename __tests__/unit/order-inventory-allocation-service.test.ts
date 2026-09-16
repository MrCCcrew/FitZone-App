import { describe, expect, it, vi } from "vitest";
import { reserveOrderInventoryOwnedFirst } from "@/lib/order-inventory-allocation-service";

describe("reserveOrderInventoryOwnedFirst", () => {
  it("uses owned stock first then consignment overflow", async () => {
    const allocationCreates: any[] = [];

    const tx = {
      orderItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "item-1",
            productId: "product-1",
            variantId: null,
            quantity: 7,
            product: {
              id: "product-1",
              name: "Test Product",
              stock: 5,
              reservedStock: 0,
              trackInventory: true,
            },
          },
        ]),
      },

      orderInventoryAllocation: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(async ({ data }) => {
          allocationCreates.push(data);
          return { id: `alloc-${allocationCreates.length}`, ...data };
        }),
      },

      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "product-1",
          name: "Test Product",
          stock: 5,
          reservedStock: 0,
          trackInventory: true,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },

      consignmentLot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lot-1",
            quantityAvailable: 10,
            quantityReserved: 0,
            unitCost: 20,
            createdAt: new Date("2026-09-01T00:00:00Z"),
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await reserveOrderInventoryOwnedFirst(
      tx as any,
      "order-1"
    );

    expect(result).toEqual([
      {
        orderItemId: "item-1",
        productId: "product-1",
        ownedQuantity: 5,
        consignmentQuantity: 2,
      },
    ]);

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "product-1",
        stock: 5,
        reservedStock: 0,
      },
      data: {
        reservedStock: {
          increment: 5,
        },
      },
    });

    expect(tx.consignmentLot.updateMany).toHaveBeenCalledWith({
      where: {
        id: "lot-1",
        status: "open",
        quantityAvailable: 10,
        quantityReserved: 0,
      },
      data: {
        quantityReserved: {
          increment: 2,
        },
      },
    });

    expect(allocationCreates).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        orderItemId: "item-1",
        source: "owned",
        quantity: 5,
        status: "reserved",
      }),
      expect.objectContaining({
        orderId: "order-1",
        orderItemId: "item-1",
        source: "consignment",
        consignmentLotId: "lot-1",
        quantity: 2,
        status: "reserved",
      }),
    ]);
  });
});

describe("releaseOrderInventoryAllocations", () => {
  it("releases owned and consignment reservations exactly", async () => {
    const { releaseOrderInventoryAllocations } =
      await import("@/lib/order-inventory-allocation-service");

    const updates: any[] = [];

    const tx = {
      orderInventoryAllocation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a-owned",
            source: "owned",
            quantity: 5,
            consignmentLotId: null,
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 5,
                reservedStock: 5,
              },
            },
          },
          {
            id: "a-consignment",
            source: "consignment",
            quantity: 2,
            consignmentLotId: "lot-1",
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 5,
                reservedStock: 5,
              },
            },
          },
        ]),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          updates.push({ where, data });
          return {};
        }),
      },

      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "product-1",
          name: "Product",
          stock: 5,
          reservedStock: 5,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },

      consignmentLot: {
        findUnique: vi.fn().mockResolvedValue({
          id: "lot-1",
          quantityAvailable: 10,
          quantityReserved: 2,
          status: "open",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await releaseOrderInventoryAllocations(
      tx as any,
      "order-1"
    );

    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          reservedStock: {
            decrement: 5,
          },
        },
      })
    );

    expect(tx.consignmentLot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          quantityReserved: {
            decrement: 2,
          },
        },
      })
    );

    expect(updates).toEqual([
      {
        where: { id: "a-owned" },
        data: { status: "released" },
      },
      {
        where: { id: "a-consignment" },
        data: { status: "released" },
      },
    ]);
  });
});
