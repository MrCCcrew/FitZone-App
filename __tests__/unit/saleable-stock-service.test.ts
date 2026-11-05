import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
    },
    consignmentLot: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import {
  getCatalogStockByProductIds,
  getSaleableStockByProductIds,
} from "@/lib/saleable-stock-service";

describe("saleable stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds owned available and compatible consignment available", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      {
        id: "p1",
        stock: 5,
        reservedStock: 2,
        trackInventory: true,
      },
    ] as any);

    vi.mocked(db.consignmentLot.findMany).mockResolvedValue([
      {
        productId: "p1",
        quantityAvailable: 10,
        quantityReserved: 3,
      },
      {
        productId: "p1",
        quantityAvailable: 4,
        quantityReserved: 1,
      },
    ] as any);

    const result =
      await getSaleableStockByProductIds(["p1"]);

    expect(result.get("p1")).toEqual({
      productId: "p1",
      variantId: null,
      ownedAvailable: 3,
      consignmentAvailable: 10,
      totalAvailable: 13,
      trackInventory: true,
    });

    expect(db.consignmentLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "open",
        }),
      })
    );
  });

  it("keeps transiently reserved physical stock visible in the public catalog", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      {
        id: "p-reserved",
        stock: 1,
        reservedStock: 1,
        trackInventory: true,
      },
    ] as any);

    vi.mocked(db.consignmentLot.findMany).mockResolvedValue([
      {
        productId: "p-reserved",
        quantityAvailable: 1,
        quantityReserved: 1,
      },
    ] as any);

    const checkoutStock =
      await getSaleableStockByProductIds(["p-reserved"]);

    const catalogStock =
      await getCatalogStockByProductIds(["p-reserved"]);

    expect(checkoutStock.get("p-reserved")?.totalAvailable)
      .toBe(0);

    expect(catalogStock.get("p-reserved")).toEqual({
      productId: "p-reserved",
      variantId: null,
      ownedAvailable: 1,
      consignmentAvailable: 1,
      totalAvailable: 2,
      trackInventory: true,
    });
  });
  it("does not block non-tracked products", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      {
        id: "p2",
        stock: 0,
        reservedStock: 0,
        trackInventory: false,
      },
    ] as any);

    vi.mocked(db.consignmentLot.findMany).mockResolvedValue([]);

    const result =
      await getSaleableStockByProductIds(["p2"]);

    expect(result.get("p2")?.totalAvailable)
      .toBe(Number.MAX_SAFE_INTEGER);
  });
});
