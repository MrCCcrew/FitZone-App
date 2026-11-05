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
  "consignment supplier liability return after payment",
  () => {
    it(
      "marks the liability as supplier credit when the supplier was already paid",
      async () => {
        const tx = {
          orderInventoryAllocation: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: "cons-paid-a",
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
                    averageCost: 0,
                    trackInventory: true,
                  },
                },
              },
            ]),
            update: vi.fn().mockResolvedValue({}),
          },

          product: {
            findUnique: vi.fn().mockResolvedValue({
              id: "product-1",
              name: "Product",
              stock: 0,
              averageCost: 0,
              trackInventory: true,
            }),
          },

          inventoryMovement: {
            create: vi.fn(),
          },

          consignmentLot: {
            findUnique: vi.fn().mockResolvedValue({
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

            updateMany: vi.fn().mockResolvedValue({
              count: 1,
            }),
          },

          consignmentMovement: {
            create: vi.fn().mockResolvedValue({
              id: "return-movement",
            }),
          },

          consignmentSupplierLiability: {
            findUnique: vi.fn().mockResolvedValue({
              id: "liability-paid",
              grossAmount: 40,
              paidAmount: 40,
              reversedAmount: 0,
            }),

            update: vi.fn().mockResolvedValue({
              id: "liability-paid",
              status: "credit",
            }),
          },
        };

        await returnOrderInventoryAllocations(
          tx as any,
          "order-1"
        );

        expect(
          tx.consignmentSupplierLiability.update
        ).toHaveBeenCalledWith({
          where: {
            id: "liability-paid",
          },
          data: expect.objectContaining({
            reversedAmount: 40,
            status: "credit",
            reversedAt: expect.any(Date),
          }),
        });

        expect(
          tx.orderInventoryAllocation.update
        ).toHaveBeenCalledWith({
          where: {
            id: "cons-paid-a",
          },
          data: {
            status: "returned",
          },
        });
      }
    );
  }
);
