import { describe, expect, it, vi } from "vitest";

import {
  reserveOrderInventoryOwnedFirst,
  releaseOrderInventoryAllocations,
  confirmOrderInventoryAllocationSale,
  returnOrderInventoryAllocations,
} from "@/lib/order-inventory-allocation-service";

describe("duplicate same-product allocation hardening", () => {
  it("reserves duplicate order items using fresh product state", async () => {
    const state = {
      stock: 10,
      reservedStock: 0,
    };

    const allocations: any[] = [];

    const tx = {
      orderItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "item-1",
            productId: "product-1",
            variantId: null,
            quantity: 3,
            product: {
              id: "product-1",
              name: "Product",
              stock: 10,
              reservedStock: 0,
              trackInventory: true,
            },
          },
          {
            id: "item-2",
            productId: "product-1",
            variantId: null,
            quantity: 4,
            product: {
              id: "product-1",
              name: "Product",
              stock: 10,
              reservedStock: 0,
              trackInventory: true,
            },
          },
        ]),
      },

      product: {
        findUnique: vi.fn().mockImplementation(async () => ({
          id: "product-1",
          name: "Product",
          stock: state.stock,
          reservedStock: state.reservedStock,
          trackInventory: true,
        })),

        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          if (
            where.stock !== state.stock ||
            where.reservedStock !== state.reservedStock
          ) {
            return { count: 0 };
          }

          state.reservedStock +=
            Number(data.reservedStock?.increment ?? 0);

          return { count: 1 };
        }),
      },

      orderInventoryAllocation: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(async ({ data }) => {
          allocations.push(data);
          return { id: `a-${allocations.length}`, ...data };
        }),
      },

      consignmentLot: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
    };

    const result =
      await reserveOrderInventoryOwnedFirst(
        tx as any,
        "order-1"
      );

    expect(state.reservedStock).toBe(7);
    expect(result).toHaveLength(2);

    expect(
      result.reduce(
        (sum, row) => sum + row.ownedQuantity,
        0
      )
    ).toBe(7);

    expect(allocations).toHaveLength(2);
    expect(tx.product.findUnique).toHaveBeenCalledTimes(2);
  });

  it("releases duplicate owned allocations using fresh state", async () => {
    const state = {
      stock: 10,
      reservedStock: 7,
    };

    const tx = {
      orderInventoryAllocation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a-1",
            source: "owned",
            quantity: 3,
            consignmentLotId: null,
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 10,
                reservedStock: 7,
              },
            },
          },
          {
            id: "a-2",
            source: "owned",
            quantity: 4,
            consignmentLotId: null,
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 10,
                reservedStock: 7,
              },
            },
          },
        ]),

        update: vi.fn().mockResolvedValue({}),
      },

      product: {
        findUnique: vi.fn().mockImplementation(async () => ({
          id: "product-1",
          name: "Product",
          stock: state.stock,
          reservedStock: state.reservedStock,
        })),

        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          if (
            where.stock !== state.stock ||
            where.reservedStock !== state.reservedStock
          ) {
            return { count: 0 };
          }

          state.reservedStock -=
            Number(data.reservedStock?.decrement ?? 0);

          return { count: 1 };
        }),
      },

      consignmentLot: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    await releaseOrderInventoryAllocations(
      tx as any,
      "order-1"
    );

    expect(state.reservedStock).toBe(0);
    expect(tx.product.findUnique).toHaveBeenCalledTimes(2);
    expect(
      tx.orderInventoryAllocation.update
    ).toHaveBeenCalledTimes(2);
  });

  it("sells duplicate owned allocations using fresh state", async () => {
    const state = {
      stock: 10,
      reservedStock: 7,
      averageCost: 5,
    };

    const movements: any[] = [];

    const tx = {
      orderInventoryAllocation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a-1",
            orderItemId: "item-1",
            source: "owned",
            consignmentLotId: null,
            quantity: 3,
            unitCost: null,
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 10,
                reservedStock: 7,
                averageCost: 5,
                trackInventory: true,
              },
            },
          },
          {
            id: "a-2",
            orderItemId: "item-2",
            source: "owned",
            consignmentLotId: null,
            quantity: 4,
            unitCost: null,
            orderItem: {
              productId: "product-1",
              product: {
                name: "Product",
                stock: 10,
                reservedStock: 7,
                averageCost: 5,
                trackInventory: true,
              },
            },
          },
        ]),

        update: vi.fn().mockResolvedValue({}),
      },

      product: {
        findUnique: vi.fn().mockImplementation(async () => ({
          id: "product-1",
          name: "Product",
          stock: state.stock,
          reservedStock: state.reservedStock,
          averageCost: state.averageCost,
          trackInventory: true,
        })),

        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          if (
            where.stock !== state.stock ||
            where.reservedStock !== state.reservedStock
          ) {
            return { count: 0 };
          }

          state.stock -= Number(data.stock?.decrement ?? 0);
          state.reservedStock -=
            Number(data.reservedStock?.decrement ?? 0);

          return { count: 1 };
        }),
      },

      inventoryMovement: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          movements.push(data);
          return { id: `m-${movements.length}` };
        }),
      },

      consignmentLot: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },

      consignmentMovement: {
        create: vi.fn(),
      },

      orderItem: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const result =
      await confirmOrderInventoryAllocationSale(
        tx as any,
        "order-1"
      );

    expect(state.stock).toBe(3);
    expect(state.reservedStock).toBe(0);
    expect(movements).toHaveLength(2);
    expect(result).toHaveLength(2);
    expect(tx.product.findUnique).toHaveBeenCalledTimes(2);
  });

  it("returns duplicate owned allocations using fresh stock/WAC state", async () => {
    const state = {
      stock: 3,
      averageCost: 5,
    };

    const movements: any[] = [];

    const tx = {
      orderInventoryAllocation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a-1",
            orderItemId: "item-1",
            source: "owned",
            consignmentLotId: null,
            quantity: 3,
            unitCost: 5,
            orderItem: {
              productId: "product-1",
              product: {
                id: "product-1",
                name: "Product",
                stock: 3,
                averageCost: 5,
                trackInventory: true,
              },
            },
          },
          {
            id: "a-2",
            orderItemId: "item-2",
            source: "owned",
            consignmentLotId: null,
            quantity: 4,
            unitCost: 5,
            orderItem: {
              productId: "product-1",
              product: {
                id: "product-1",
                name: "Product",
                stock: 3,
                averageCost: 5,
                trackInventory: true,
              },
            },
          },
        ]),

        update: vi.fn().mockResolvedValue({}),
      },

      product: {
        findUnique: vi.fn().mockImplementation(async () => ({
          id: "product-1",
          name: "Product",
          stock: state.stock,
          averageCost: state.averageCost,
          trackInventory: true,
        })),

        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          if (
            where.stock !== state.stock ||
            Number(where.averageCost) !==
              Number(state.averageCost)
          ) {
            return { count: 0 };
          }

          state.stock += Number(data.stock?.increment ?? 0);

          if (data.averageCost !== undefined) {
            state.averageCost =
              Number(data.averageCost);
          }

          return { count: 1 };
        }),
      },

      inventoryMovement: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          movements.push(data);
          return { id: `m-${movements.length}` };
        }),
      },

      consignmentLot: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },

      consignmentMovement: {
        create: vi.fn(),
      },
    };

    const result =
      await returnOrderInventoryAllocations(
        tx as any,
        "order-1"
      );

    expect(state.stock).toBe(10);
    expect(state.averageCost).toBeCloseTo(5);
    expect(movements).toHaveLength(2);
    expect(result).toHaveLength(2);
    expect(tx.product.findUnique).toHaveBeenCalledTimes(2);
  });
});
