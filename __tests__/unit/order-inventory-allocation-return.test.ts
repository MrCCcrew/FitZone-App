import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  returnOrderInventoryAllocations,
} from "@/lib/order-inventory-allocation-service";

describe(
  "returnOrderInventoryAllocations",
  () => {
    it(
      "returns owned to Product and consignment to original lot",
      async () => {
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
                unitCost: 10,
                orderItem: {
                  productId: "product-1",
                  product: {
                    id: "product-1",
                    name: "Product",
                    stock: 0,
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
                    id: "product-1",
                    name: "Product",
                    stock: 0,
                    averageCost: 10,
                    trackInventory: true,
                  },
                },
              },
            ]),

            update: vi.fn()
              .mockImplementation(
                async (args) => {
                  allocationUpdates.push(args);
                  return {};
                }
              ),
          },

          product: {
            findUnique: vi.fn()
              .mockResolvedValue({
                id: "product-1",
                name: "Product",
                stock: 0,
                averageCost: 10,
                trackInventory: true,
              }),
            updateMany: vi.fn()
              .mockResolvedValue({
                count: 1,
              }),
          },

          inventoryMovement: {
            create: vi.fn()
              .mockResolvedValue({
                id: "owned-return",
              }),
          },

          consignmentLot: {
            findUnique: vi.fn()
              .mockResolvedValue({
                id: "lot-1",
                supplierId: "supplier-1",
                productId: "product-1",
                variantId: null,
                quantityAvailable: 8,
                quantityReserved: 0,
                quantitySold: 2,
                unitCost: 20,
                status: "open",
              }),

            updateMany: vi.fn()
              .mockResolvedValue({
                count: 1,
              }),
          },

          consignmentMovement: {
            create: vi.fn()
              .mockResolvedValue({
                id: "cons-return",
              }),
          },
        };

        const result =
          await returnOrderInventoryAllocations(
            tx as any,
            "order-1"
          );

        expect(
          tx.product.updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              stock: {
                increment: 5,
              },
            }),
          })
        );

        expect(
          tx.consignmentLot.updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              quantityAvailable: {
                increment: 2,
              },
              quantitySold: {
                decrement: 2,
              },
              status: "open",
            },
          })
        );

        expect(
          tx.consignmentMovement.create
        ).toHaveBeenCalledWith({
          data: expect.objectContaining({
            type: "SALE_REVERSAL",
            quantityChange: 2,
            quantityBefore: 8,
            quantityAfter: 10,
          }),
        });

        expect(result).toEqual([
          expect.objectContaining({
            ownedQuantity: 5,
            consignmentQuantity: 2,
            ownedCost: 50,
            consignmentCost: 40,
            totalCost: 90,
          }),
        ]);

        expect(
          allocationUpdates
        ).toHaveLength(2);

        expect(
          allocationUpdates[0].data.status
        ).toBe("returned");

        expect(
          allocationUpdates[1].data.status
        ).toBe("returned");
      }
    );
  }
);
