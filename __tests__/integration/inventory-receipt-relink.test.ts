import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error("REFUSING: receipt relink tests require fitzone_test");
}

const db = new PrismaClient();

let supplier1Id: string;
let supplier2Id: string;
let productId: string;

const PREFIX = "TEST-RELINK-";

async function cleanup() {
  await db.inventoryReceiptInvoiceLinkHistory.deleteMany({
    where: {
      receipt: {
        referenceNumber: {
          startsWith: PREFIX,
        },
      },
    },
  });

  const receipts = await db.inventoryReceipt.findMany({
    where: {
      referenceNumber: {
        startsWith: PREFIX,
      },
    },
    select: { id: true },
  });

  const receiptIds = receipts.map((x) => x.id);

  if (receiptIds.length) {
    await db.inventoryMovement.deleteMany({
      where: {
        referenceId: {
          in: receiptIds,
        },
      },
    });
  }

  await db.inventoryReceipt.deleteMany({
    where: {
      referenceNumber: {
        startsWith: PREFIX,
      },
    },
  });

  await db.journalEntry.deleteMany({
    where: {
      journal: {
        referenceId: {
          in: (
            await db.purchaseInvoice.findMany({
              where: {
                invoiceNumber: {
                  startsWith: PREFIX,
                },
              },
              select: { id: true },
            })
          ).map((x) => x.id),
        },
      },
    },
  });

  await db.journal.deleteMany({
    where: {
      referenceId: {
        in: (
          await db.purchaseInvoice.findMany({
            where: {
              invoiceNumber: {
                startsWith: PREFIX,
              },
            },
            select: { id: true },
          })
        ).map((x) => x.id),
      },
    },
  });

  await db.purchaseInvoiceItem.deleteMany({
    where: {
      purchaseInvoice: {
        invoiceNumber: {
          startsWith: PREFIX,
        },
      },
    },
  });

  await db.purchaseInvoice.deleteMany({
    where: {
      invoiceNumber: {
        startsWith: PREFIX,
      },
    },
  });

  await db.product.deleteMany({
    where: {
      name: `${PREFIX}PRODUCT`,
    },
  });

  await db.supplier.deleteMany({
    where: {
      code: {
        in: [`${PREFIX}S1`, `${PREFIX}S2`],
      },
    },
  });
}

async function createInvoice(
  number: string,
  supplierId: string,
  total: number,
) {
  const { createPurchaseInvoiceDraft } =
    await import("@/lib/supplier-ap-service");

  return createPurchaseInvoiceDraft({
    supplierId,
    invoiceNumber: number,
    invoiceDate: new Date(),
    items: [
      {
        description: number,
        quantity: 1,
        unitCost: total,
      },
    ],
  });
}

async function createLinkedReceipt(params: {
  number: string;
  invoiceId: string;
  supplierId: string;
  total: number;
  status?: string;
}) {
  return db.inventoryReceipt.create({
    data: {
      referenceNumber: params.number,
      purchaseInvoiceId: params.invoiceId,
      supplierId: params.supplierId,
      status: params.status ?? "posted",
      totalCost: params.total,
      items: {
        create: [
          {
            productId,
            quantity: 1,
            unitCost: params.total,
            totalCost: params.total,
          },
        ],
      },
    },
  });
}

beforeAll(async () => {
  await cleanup();

  const s1 = await db.supplier.create({
    data: {
      name: "Relink Supplier 1",
      code: `${PREFIX}S1`,
      isActive: true,
    },
  });

  const s2 = await db.supplier.create({
    data: {
      name: "Relink Supplier 2",
      code: `${PREFIX}S2`,
      isActive: true,
    },
  });

  supplier1Id = s1.id;
  supplier2Id = s2.id;

  const product = await db.product.create({
    data: {
      name: `${PREFIX}PRODUCT`,
      category: "test",
      price: 500,
      stock: 7,
      trackInventory: true,
      averageCost: 42.5,
      costPrice: 42.5,
      lastPurchaseCost: 50,
      isActive: true,
    },
  });

  productId = product.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Inventory receipt purchase-invoice relink", () => {
  it("relinks from cancelled invoice to draft invoice and writes immutable history without touching inventory or GL", async () => {
    const {
      postPurchaseInvoice,
      cancelPurchaseInvoice,
      relinkInventoryReceipt,
    } = await import("@/lib/supplier-ap-service");

    const oldInvoice = await createInvoice(
      `${PREFIX}OLD-001`,
      supplier1Id,
      100,
    );

    const receipt = await createLinkedReceipt({
      number: `${PREFIX}R-001`,
      invoiceId: oldInvoice.id,
      supplierId: supplier1Id,
      total: 100,
    });

    await postPurchaseInvoice(oldInvoice.id);
    await cancelPurchaseInvoice(oldInvoice.id);

    const newInvoice = await createInvoice(
      `${PREFIX}NEW-001`,
      supplier1Id,
      100,
    );

    const productBefore = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    const movementCountBefore = await db.inventoryMovement.count({
      where: { productId },
    });

    const journalCountBefore = await db.journal.count({});

    const result = await relinkInventoryReceipt({
      receiptId: receipt.id,
      newPurchaseInvoiceId: newInvoice.id,
      actorUserId: null,
      reason: "Correcting cancelled supplier financial invoice",
    });

    expect(result.fromPurchaseInvoiceId).toBe(oldInvoice.id);
    expect(result.toPurchaseInvoiceId).toBe(newInvoice.id);

    const savedReceipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
    });

    expect(savedReceipt.purchaseInvoiceId).toBe(newInvoice.id);
    expect(savedReceipt.status).toBe("posted");

    const history =
      await db.inventoryReceiptInvoiceLinkHistory.findUniqueOrThrow({
        where: { id: result.historyId },
      });

    expect(history.receiptId).toBe(receipt.id);
    expect(history.fromPurchaseInvoiceId).toBe(oldInvoice.id);
    expect(history.toPurchaseInvoiceId).toBe(newInvoice.id);
    expect(history.reason).toBe(
      "Correcting cancelled supplier financial invoice",
    );

    const productAfter = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    expect(productAfter.stock).toBe(productBefore.stock);
    expect(productAfter.averageCost).toBe(productBefore.averageCost);
    expect(productAfter.lastPurchaseCost).toBe(productBefore.lastPurchaseCost);

    expect(
      await db.inventoryMovement.count({
        where: { productId },
      }),
    ).toBe(movementCountBefore);

    expect(await db.journal.count({})).toBe(journalCountBefore);
  });

  it("rejects relink while current invoice is still posted", async () => {
    const { postPurchaseInvoice, relinkInventoryReceipt } =
      await import("@/lib/supplier-ap-service");

    const oldInvoice = await createInvoice(
      `${PREFIX}OLD-002`,
      supplier1Id,
      100,
    );

    const receipt = await createLinkedReceipt({
      number: `${PREFIX}R-002`,
      invoiceId: oldInvoice.id,
      supplierId: supplier1Id,
      total: 100,
    });

    await postPurchaseInvoice(oldInvoice.id);

    const newInvoice = await createInvoice(
      `${PREFIX}NEW-002`,
      supplier1Id,
      100,
    );

    await expect(
      relinkInventoryReceipt({
        receiptId: receipt.id,
        newPurchaseInvoiceId: newInvoice.id,
        reason: "Should fail",
      }),
    ).rejects.toThrow(/cancelled purchase invoice/i);
  });

  it("rejects relink to a non-draft target invoice", async () => {
    const {
      postPurchaseInvoice,
      cancelPurchaseInvoice,
      relinkInventoryReceipt,
    } = await import("@/lib/supplier-ap-service");

    const oldInvoice = await createInvoice(
      `${PREFIX}OLD-003`,
      supplier1Id,
      100,
    );

    const receipt = await createLinkedReceipt({
      number: `${PREFIX}R-003`,
      invoiceId: oldInvoice.id,
      supplierId: supplier1Id,
      total: 100,
    });

    await postPurchaseInvoice(oldInvoice.id);
    await cancelPurchaseInvoice(oldInvoice.id);

    const target = await createInvoice(`${PREFIX}NEW-003`, supplier1Id, 100);

    const targetReceipt = await createLinkedReceipt({
      number: `${PREFIX}R-003-TARGET`,
      invoiceId: target.id,
      supplierId: supplier1Id,
      total: 100,
    });

    await postPurchaseInvoice(target.id);

    await expect(
      relinkInventoryReceipt({
        receiptId: receipt.id,
        newPurchaseInvoiceId: target.id,
        reason: "Should fail",
      }),
    ).rejects.toThrow(/draft purchase invoice/i);

    expect(targetReceipt.status).toBe("posted");
  });

  it("rejects cross-supplier relink", async () => {
    const {
      postPurchaseInvoice,
      cancelPurchaseInvoice,
      relinkInventoryReceipt,
    } = await import("@/lib/supplier-ap-service");

    const oldInvoice = await createInvoice(
      `${PREFIX}OLD-004`,
      supplier1Id,
      100,
    );

    const receipt = await createLinkedReceipt({
      number: `${PREFIX}R-004`,
      invoiceId: oldInvoice.id,
      supplierId: supplier1Id,
      total: 100,
    });

    await postPurchaseInvoice(oldInvoice.id);
    await cancelPurchaseInvoice(oldInvoice.id);

    const target = await createInvoice(`${PREFIX}NEW-004`, supplier2Id, 100);

    await expect(
      relinkInventoryReceipt({
        receiptId: receipt.id,
        newPurchaseInvoiceId: target.id,
        reason: "Should fail",
      }),
    ).rejects.toThrow(/same supplier/i);
  });

  it("rejects relink when target invoice total would be exceeded", async () => {
    const {
      postPurchaseInvoice,
      cancelPurchaseInvoice,
      relinkInventoryReceipt,
    } = await import("@/lib/supplier-ap-service");

    const oldInvoice = await createInvoice(`${PREFIX}OLD-005`, supplier1Id, 70);

    const receipt = await createLinkedReceipt({
      number: `${PREFIX}R-005`,
      invoiceId: oldInvoice.id,
      supplierId: supplier1Id,
      total: 70,
    });

    await postPurchaseInvoice(oldInvoice.id);
    await cancelPurchaseInvoice(oldInvoice.id);

    const target = await createInvoice(`${PREFIX}NEW-005`, supplier1Id, 100);

    await createLinkedReceipt({
      number: `${PREFIX}R-005-TARGET`,
      invoiceId: target.id,
      supplierId: supplier1Id,
      total: 40,
    });

    await expect(
      relinkInventoryReceipt({
        receiptId: receipt.id,
        newPurchaseInvoiceId: target.id,
        reason: "Should exceed target",
      }),
    ).rejects.toThrow(/exceed the new purchase invoice total/i);
  });

  it("rejects relinking a cancelled receipt", async () => {
    const {
      postPurchaseInvoice,
      cancelPurchaseInvoice,
      relinkInventoryReceipt,
    } = await import("@/lib/supplier-ap-service");

    const oldInvoice = await createInvoice(
      `${PREFIX}OLD-006`,
      supplier1Id,
      100,
    );

    const receipt = await createLinkedReceipt({
      number: `${PREFIX}R-006`,
      invoiceId: oldInvoice.id,
      supplierId: supplier1Id,
      total: 100,
    });

    await postPurchaseInvoice(oldInvoice.id);
    await cancelPurchaseInvoice(oldInvoice.id);

    await db.inventoryReceipt.update({
      where: { id: receipt.id },
      data: { status: "cancelled" },
    });

    const target = await createInvoice(`${PREFIX}NEW-006`, supplier1Id, 100);

    await expect(
      relinkInventoryReceipt({
        receiptId: receipt.id,
        newPurchaseInvoiceId: target.id,
        reason: "Should fail",
      }),
    ).rejects.toThrow(/Only posted inventory receipts/i);
  });

  it("requires a non-empty relink reason", async () => {
    const { relinkInventoryReceipt } =
      await import("@/lib/supplier-ap-service");

    await expect(
      relinkInventoryReceipt({
        receiptId: "some-receipt",
        newPurchaseInvoiceId: "some-invoice",
        reason: "   ",
      }),
    ).rejects.toThrow(/Relink reason is required/i);
  });

  it("serializes safely against posting the target invoice", async () => {
    const {
      postPurchaseInvoice,
      cancelPurchaseInvoice,
      relinkInventoryReceipt,
    } = await import("@/lib/supplier-ap-service");

    const oldInvoice = await createInvoice(
      `${PREFIX}OLD-CONC-001`,
      supplier1Id,
      100,
    );

    const receipt = await createLinkedReceipt({
      number: `${PREFIX}R-CONC-001`,
      invoiceId: oldInvoice.id,
      supplierId: supplier1Id,
      total: 100,
    });

    await postPurchaseInvoice(oldInvoice.id);
    await cancelPurchaseInvoice(oldInvoice.id);

    const target = await createInvoice(
      `${PREFIX}NEW-CONC-001`,
      supplier1Id,
      100,
    );

    const productBefore = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    const movementCountBefore = await db.inventoryMovement.count({
      where: { productId },
    });

    const [relinkResult, postResult] = await Promise.allSettled([
      relinkInventoryReceipt({
        receiptId: receipt.id,
        newPurchaseInvoiceId: target.id,
        reason: "Concurrency relink test",
      }),
      postPurchaseInvoice(target.id),
    ]);

    // Relink must always succeed:
    // - if it locks first, POST sees the linked receipt and may post;
    // - if POST locks first, POST safely rejects because no receipt exists yet,
    //   then relink proceeds while the invoice remains draft.
    expect(relinkResult.status).toBe("fulfilled");

    const savedReceipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
    });

    const savedTarget = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: target.id },
    });

    expect(savedReceipt.purchaseInvoiceId).toBe(target.id);
    expect(savedReceipt.status).toBe("posted");

    const histories = await db.inventoryReceiptInvoiceLinkHistory.findMany({
      where: {
        receiptId: receipt.id,
        toPurchaseInvoiceId: target.id,
      },
    });

    expect(histories).toHaveLength(1);
    expect(histories[0].fromPurchaseInvoiceId).toBe(oldInvoice.id);

    if (postResult.status === "fulfilled") {
      expect(savedTarget.status).toBe("posted");

      expect(
        await db.journal.count({
          where: {
            referenceType: "PurchaseInvoice",
            referenceId: target.id,
          },
        }),
      ).toBe(1);
    } else {
      expect(savedTarget.status).toBe("draft");

      expect(String(postResult.reason)).toMatch(
        /linked inventory receipt|without at least one/i,
      );

      expect(
        await db.journal.count({
          where: {
            referenceType: "PurchaseInvoice",
            referenceId: target.id,
          },
        }),
      ).toBe(0);
    }

    const productAfter = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    expect(productAfter.stock).toBe(productBefore.stock);
    expect(productAfter.averageCost).toBe(productBefore.averageCost);
    expect(productAfter.lastPurchaseCost).toBe(productBefore.lastPurchaseCost);

    expect(
      await db.inventoryMovement.count({
        where: { productId },
      }),
    ).toBe(movementCountBefore);
  });
});
