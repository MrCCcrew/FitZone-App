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
  getSaleableItemKey,
  getSaleableStockByProductIds,
  getSaleableStockForItems,
} from "@/lib/saleable-stock-service";

describe("variant saleable stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("product card includes all consignment variants", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      {
        id: "p1",
        stock: 0,
        reservedStock: 0,
        trackInventory: true,
      },
    ] as any);

    vi.mocked(db.consignmentLot.findMany).mockResolvedValue([
      {
        productId: "p1",
        quantityAvailable: 4,
        quantityReserved: 1,
      },
      {
        productId: "p1",
        quantityAvailable: 7,
        quantityReserved: 2,
      },
    ] as any);

    const result =
      await getSaleableStockByProductIds(["p1"]);

    expect(result.get("p1")?.totalAvailable).toBe(8);
  });

  it("exact variant only sees its own consignment lots", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      {
        id: "p1",
        stock: 2,
        reservedStock: 1,
        trackInventory: true,
      },
    ] as any);

    vi.mocked(db.consignmentLot.findMany).mockResolvedValue([
      {
        productId: "p1",
        variantId: "v1",
        quantityAvailable: 10,
        quantityReserved: 3,
      },
      {
        productId: "p1",
        variantId: "v2",
        quantityAvailable: 20,
        quantityReserved: 0,
      },
      {
        productId: "p1",
        variantId: null,
        quantityAvailable: 100,
        quantityReserved: 0,
      },
    ] as any);

    const result =
      await getSaleableStockForItems([
        { productId: "p1", variantId: "v1" },
      ]);

    const row = result.get(
      getSaleableItemKey("p1", "v1"),
    );

    // owned available = 1
    // exact v1 consignment = 7
    expect(row?.totalAvailable).toBe(8);
    expect(row?.consignmentAvailable).toBe(7);
  });

  it("variant-less request never consumes variant lots", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      {
        id: "p1",
        stock: 0,
        reservedStock: 0,
        trackInventory: true,
      },
    ] as any);

    vi.mocked(db.consignmentLot.findMany).mockResolvedValue([
      {
        productId: "p1",
        variantId: "v1",
        quantityAvailable: 10,
        quantityReserved: 0,
      },
      {
        productId: "p1",
        variantId: null,
        quantityAvailable: 3,
        quantityReserved: 1,
      },
    ] as any);

    const result =
      await getSaleableStockForItems([
        { productId: "p1", variantId: null },
      ]);

    expect(
      result.get(
        getSaleableItemKey("p1", null),
      )?.consignmentAvailable,
    ).toBe(2);
  });
});
