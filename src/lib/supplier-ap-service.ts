import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { postJournal, reverseJournal } from "@/lib/accounting-service";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const AP_ACCOUNT = "2010";
const INVENTORY_ACCOUNT = "1010";
const CASH_ACCOUNT = "1020";

const VALID_PAYMENT_TERMS = new Set(["cash", "credit", "mixed"]);

function toMinor(value: number): number {
  return Math.round(value * 100);
}

function fromMinor(value: number): number {
  return value / 100;
}

function requirePositiveMoney(value: number, field: string): number {
  if (!Number.isFinite(value) || toMinor(value) <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }

  return fromMinor(toMinor(value));
}

function normalizePaymentTerms(value?: string | null): string | null {
  if (value == null || value.trim() === "") return null;

  const normalized = value.trim().toLowerCase();

  if (!VALID_PAYMENT_TERMS.has(normalized)) {
    throw new Error(`Invalid payment terms: ${value}`);
  }

  return normalized;
}

function mapSupplierPaymentAccount(method: string): string {
  const normalized = method.trim().toLowerCase();

  if (normalized === "cash") {
    return CASH_ACCOUNT;
  }

  throw new Error(
    `Unsupported supplier payment method "${method}". ` +
      `Only cash is enabled until the correct bank GL account is configured.`,
  );
}

async function lockPurchaseInvoice(tx: TransactionClient, invoiceId: string) {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM PurchaseInvoice
      WHERE id = ${invoiceId}
      FOR UPDATE
    `,
  );
}

async function lockInventoryReceiptsForPurchaseInvoice(
  tx: TransactionClient,
  purchaseInvoiceId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM InventoryReceipt
      WHERE purchaseInvoiceId = ${purchaseInvoiceId}
      ORDER BY id
      FOR UPDATE
    `,
  );
}

async function lockInventoryReceipt(tx: TransactionClient, receiptId: string) {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM InventoryReceipt
      WHERE id = ${receiptId}
      FOR UPDATE
    `,
  );
}

async function lockSupplierPayment(tx: TransactionClient, paymentId: string) {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM SupplierPayment
      WHERE id = ${paymentId}
      FOR UPDATE
    `,
  );
}

async function lockPurchaseInvoices(
  tx: TransactionClient,
  invoiceIds: string[],
) {
  const ids = [...new Set(invoiceIds)].sort();

  if (!ids.length) return;

  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM PurchaseInvoice
      WHERE id IN (${Prisma.join(ids)})
      ORDER BY id
      FOR UPDATE
    `,
  );
}

export async function createPurchaseInvoiceDraft(input: {
  supplierId: string;
  invoiceNumber?: string | null;
  invoiceDate: Date;
  dueDate?: Date | null;
  paymentTerms?: string | null;
  supplyType?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  items: Array<{
    productId?: string | null;
    variantId?: string | null;
    description?: string | null;
    quantity: number;
    unitCost: number;
  }>;
}) {
  if (!input.items.length) {
    throw new Error("Purchase invoice must contain at least one item");
  }

  const supplyTypeRaw = String(input.supplyType ?? "purchase")
    .trim()
    .toLowerCase();

  if (!["purchase", "consignment"].includes(supplyTypeRaw)) {
    throw new Error("Invalid purchase invoice supply type");
  }

  const normalizedItems = input.items.map((item) => {
    const productId = String(item.productId ?? "").trim() || null;
    const variantId = String(item.variantId ?? "").trim() || null;
    const description = String(item.description ?? "").trim();

    if (!productId && !description) {
      throw new Error(
        "Purchase invoice item requires either productId or legacy description",
      );
    }

    if (variantId && !productId) {
      throw new Error("Purchase invoice item variant requires a product");
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(
        "Purchase invoice item quantity must be a positive integer",
      );
    }

    const unitCost = requirePositiveMoney(item.unitCost, "unitCost");
    const totalCostMinor = toMinor(unitCost) * item.quantity;

    return {
      productId,
      variantId,
      legacyDescription: description,
      quantity: item.quantity,
      unitCost,
      totalCost: fromMinor(totalCostMinor),
    };
  });

  const totalMinor = normalizedItems.reduce(
    (sum, item) => sum + toMinor(item.totalCost),
    0,
  );

  if (totalMinor <= 0) {
    throw new Error("Purchase invoice total must be greater than zero");
  }

  const paymentTerms = normalizePaymentTerms(input.paymentTerms);

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: {
        id: input.supplierId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        supportsConsignment: true,
      },
    });

    if (!supplier) {
      throw new Error("Supplier not found or inactive");
    }

    if (supplyTypeRaw === "consignment" && !supplier.supportsConsignment) {
      throw new Error("Supplier is not enabled for consignment transactions");
    }

    const productIds = [
      ...new Set(
        normalizedItems
          .map((item) => item.productId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const variantIds = [
      ...new Set(
        normalizedItems
          .map((item) => item.variantId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const products = productIds.length
      ? await tx.product.findMany({
          where: {
            id: { in: productIds },
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            sku: true,
            supplierId: true,
          },
        })
      : [];

    if (products.length !== productIds.length) {
      throw new Error("One or more purchase invoice products were not found");
    }

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const product of products) {
      if (product.supplierId !== supplier.id) {
        throw new Error(
          `Product "${product.name}" does not belong to the selected supplier`,
        );
      }
    }

    const variants = variantIds.length
      ? await tx.productVariant.findMany({
          where: {
            id: { in: variantIds },
            isActive: true,
          },
          select: {
            id: true,
            productId: true,
            sku: true,
            size: true,
            color: true,
          },
        })
      : [];

    if (variants.length !== variantIds.length) {
      throw new Error(
        "One or more purchase invoice product variants were not found or inactive",
      );
    }

    const variantMap = new Map(
      variants.map((variant) => [variant.id, variant]),
    );

    const persistedItems = normalizedItems.map((item) => {
      if (!item.productId) {
        return {
          productId: null,
          variantId: null,
          description: item.legacyDescription,
          sku: null,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
        };
      }

      const product = productMap.get(item.productId);

      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      const variant = item.variantId ? variantMap.get(item.variantId) : null;

      if (variant && variant.productId !== product.id) {
        throw new Error(
          `Selected variant does not belong to product "${product.name}"`,
        );
      }

      const variantLabel = variant
        ? [variant.size, variant.color].filter(Boolean).join(" / ")
        : "";

      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        description: variantLabel
          ? `${product.name} - ${variantLabel}`
          : product.name,
        sku: variant?.sku ?? product.sku ?? null,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
      };
    });

    return tx.purchaseInvoice.create({
      data: {
        supplierId: supplier.id,
        invoiceNumber: input.invoiceNumber?.trim() || null,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        paymentTerms,
        supplyType: supplyTypeRaw,
        subtotal: new Prisma.Decimal(fromMinor(totalMinor)),
        totalAmount: new Prisma.Decimal(fromMinor(totalMinor)),
        status: "draft",
        notes: input.notes?.trim() || null,
        createdByUserId: input.createdByUserId ?? null,

        items: {
          create: persistedItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            description: item.description,
            sku: item.sku,
            quantity: item.quantity,
            unitCost: new Prisma.Decimal(item.unitCost),
            totalCost: new Prisma.Decimal(item.totalCost),
          })),
        },
      },
      include: { items: true },
    });
  });
}

export async function relinkInventoryReceipt(input: {
  receiptId: string;
  newPurchaseInvoiceId: string;
  reason: string;
  actorUserId?: string | null;
}) {
  const receiptId = input.receiptId.trim();
  const newPurchaseInvoiceId = input.newPurchaseInvoiceId.trim();
  const reason = input.reason.trim();

  if (!receiptId) {
    throw new Error("Inventory receipt id is required");
  }

  if (!newPurchaseInvoiceId) {
    throw new Error("New purchase invoice id is required");
  }

  if (!reason) {
    throw new Error("Relink reason is required");
  }

  return db.$transaction(async (tx) => {
    // Initial snapshot is only used to discover the currently linked invoice.
    // The receipt is re-read after all locks are acquired.
    const snapshot = await tx.inventoryReceipt.findUnique({
      where: { id: receiptId },
      select: {
        id: true,
        purchaseInvoiceId: true,
      },
    });

    if (!snapshot) {
      throw new Error("Inventory receipt not found");
    }

    if (!snapshot.purchaseInvoiceId) {
      throw new Error(
        "Inventory receipt is not currently linked to a purchase invoice",
      );
    }

    if (snapshot.purchaseInvoiceId === newPurchaseInvoiceId) {
      throw new Error(
        "Inventory receipt is already linked to this purchase invoice",
      );
    }

    const oldPurchaseInvoiceId = snapshot.purchaseInvoiceId;

    // Stable lock order:
    // 1) all involved PurchaseInvoice rows sorted by id
    // 2) InventoryReceipt row
    //
    // postPurchaseInvoice() and receipt void both lock PurchaseInvoice before
    // InventoryReceipt, so this preserves the same global order.
    await lockPurchaseInvoices(tx, [
      oldPurchaseInvoiceId,
      newPurchaseInvoiceId,
    ]);

    await lockInventoryReceipt(tx, receiptId);

    const receipt = await tx.inventoryReceipt.findUnique({
      where: { id: receiptId },
      include: {
        items: {
          select: {
            totalCost: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new Error("Inventory receipt not found");
    }

    // If another transaction changed the link between the initial read and
    // our locks, refuse instead of relinking from stale state.
    if (receipt.purchaseInvoiceId !== oldPurchaseInvoiceId) {
      throw new Error(
        "Inventory receipt link changed concurrently; retry the operation",
      );
    }

    if (receipt.status !== "posted") {
      throw new Error("Only posted inventory receipts can be relinked");
    }

    if (!receipt.supplierId) {
      throw new Error("Inventory receipt has no supplier");
    }

    if (!receipt.items.length) {
      throw new Error("Inventory receipt has no items");
    }

    const receiptItemsMinor = receipt.items.reduce(
      (sum, item) => sum + toMinor(Number(item.totalCost)),
      0,
    );

    const receiptTotalMinor = toMinor(Number(receipt.totalCost));

    if (receiptItemsMinor !== receiptTotalMinor) {
      throw new Error(
        `Inventory receipt total mismatch: items=${fromMinor(receiptItemsMinor)} receipt=${fromMinor(receiptTotalMinor)}`,
      );
    }

    const [oldInvoice, newInvoice] = await Promise.all([
      tx.purchaseInvoice.findUnique({
        where: { id: oldPurchaseInvoiceId },
        select: {
          id: true,
          supplierId: true,
          status: true,
        },
      }),
      tx.purchaseInvoice.findUnique({
        where: { id: newPurchaseInvoiceId },
        select: {
          id: true,
          supplierId: true,
          status: true,
          totalAmount: true,
        },
      }),
    ]);

    if (!oldInvoice) {
      throw new Error("Current purchase invoice not found");
    }

    if (!newInvoice) {
      throw new Error("New purchase invoice not found");
    }

    if (oldInvoice.status !== "cancelled") {
      throw new Error(
        "Inventory receipt can only be relinked from a cancelled purchase invoice",
      );
    }

    if (newInvoice.status !== "draft") {
      throw new Error(
        "Inventory receipt can only be relinked to a draft purchase invoice",
      );
    }

    if (
      oldInvoice.supplierId !== receipt.supplierId ||
      newInvoice.supplierId !== receipt.supplierId
    ) {
      throw new Error(
        "Inventory receipt and both purchase invoices must belong to the same supplier",
      );
    }

    const targetReceipts = await tx.inventoryReceipt.findMany({
      where: {
        purchaseInvoiceId: newPurchaseInvoiceId,
        status: "posted",
        id: {
          not: receipt.id,
        },
      },
      select: {
        totalCost: true,
      },
    });

    const targetExistingMinor = targetReceipts.reduce(
      (sum, targetReceipt) => sum + toMinor(Number(targetReceipt.totalCost)),
      0,
    );

    const targetInvoiceMinor = toMinor(Number(newInvoice.totalAmount));

    if (targetInvoiceMinor <= 0) {
      throw new Error("New purchase invoice total must be greater than zero");
    }

    if (targetExistingMinor + receiptTotalMinor > targetInvoiceMinor) {
      throw new Error(
        `Relink would exceed the new purchase invoice total: ` +
          `existing=${fromMinor(targetExistingMinor)} ` +
          `receipt=${fromMinor(receiptTotalMinor)} ` +
          `invoice=${fromMinor(targetInvoiceMinor)}`,
      );
    }

    // History is part of the SAME transaction as the FK change.
    // If history insertion fails, the relink must fail too.
    const history = await tx.inventoryReceiptInvoiceLinkHistory.create({
      data: {
        receiptId: receipt.id,
        fromPurchaseInvoiceId: oldPurchaseInvoiceId,
        toPurchaseInvoiceId: newPurchaseInvoiceId,
        actorUserId: input.actorUserId ?? null,
        reason,
      },
    });

    await tx.inventoryReceipt.update({
      where: { id: receipt.id },
      data: {
        purchaseInvoiceId: newPurchaseInvoiceId,
      },
    });

    // Deliberately no Product, InventoryMovement, Journal or WAC mutation.
    return {
      receiptId: receipt.id,
      fromPurchaseInvoiceId: oldPurchaseInvoiceId,
      toPurchaseInvoiceId: newPurchaseInvoiceId,
      historyId: history.id,
    };
  });
}

export async function postPurchaseInvoice(
  invoiceId: string,
  actorUserId?: string | null,
) {
  return db.$transaction(async (tx) => {
    await lockPurchaseInvoice(tx, invoiceId);
    await lockInventoryReceiptsForPurchaseInvoice(tx, invoiceId);

    const invoice = await tx.purchaseInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        receipts: {
          include: {
            items: {
              select: {
                totalCost: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new Error("Purchase invoice not found");
    }

    if (invoice.status === "posted") {
      return { invoiceId, alreadyPosted: true };
    }

    if (invoice.status !== "draft") {
      throw new Error(
        `Purchase invoice cannot be posted from status ${invoice.status}`,
      );
    }

    if (invoice.supplyType === "consignment") {
      throw new Error(
        "Consignment invoices cannot be posted through the standard purchase accounting flow",
      );
    }

    if (!invoice.items.length) {
      throw new Error("Purchase invoice has no items");
    }

    const itemTotalMinor = invoice.items.reduce(
      (sum, item) => sum + toMinor(Number(item.totalCost)),
      0,
    );

    const invoiceTotalMinor = toMinor(Number(invoice.totalAmount));

    if (invoiceTotalMinor <= 0) {
      throw new Error("Purchase invoice total must be greater than zero");
    }

    if (itemTotalMinor !== invoiceTotalMinor) {
      throw new Error(
        `Purchase invoice total mismatch: items=${fromMinor(itemTotalMinor)} invoice=${fromMinor(invoiceTotalMinor)}`,
      );
    }

    if (!invoice.receipts.length) {
      throw new Error(
        "Purchase invoice cannot be posted without at least one linked inventory receipt",
      );
    }

    let receiptTotalMinor = 0;

    for (const receipt of invoice.receipts) {
      if (receipt.status !== "posted") {
        throw new Error(`Linked inventory receipt ${receipt.id} is not posted`);
      }

      if (!receipt.supplierId || receipt.supplierId !== invoice.supplierId) {
        throw new Error(
          `Linked inventory receipt ${receipt.id} belongs to a different supplier`,
        );
      }

      if (!receipt.items.length) {
        throw new Error(`Linked inventory receipt ${receipt.id} has no items`);
      }

      const receiptItemsMinor = receipt.items.reduce(
        (sum, item) => sum + toMinor(Number(item.totalCost)),
        0,
      );

      const receiptHeaderMinor = toMinor(Number(receipt.totalCost));

      if (receiptItemsMinor !== receiptHeaderMinor) {
        throw new Error(
          `Inventory receipt total mismatch for ${receipt.id}: items=${fromMinor(receiptItemsMinor)} receipt=${fromMinor(receiptHeaderMinor)}`,
        );
      }

      receiptTotalMinor += receiptHeaderMinor;
    }

    if (receiptTotalMinor !== invoiceTotalMinor) {
      throw new Error(
        `Linked inventory receipts total mismatch: receipts=${fromMinor(receiptTotalMinor)} invoice=${fromMinor(invoiceTotalMinor)}`,
      );
    }

    await postJournal(
      tx,
      "PurchaseInvoice",
      invoice.id,
      `Supplier purchase invoice #${invoice.id.slice(-8)}`,
      [
        {
          accountCode: INVENTORY_ACCOUNT,
          debit: fromMinor(invoiceTotalMinor),
          credit: 0,
          description: "Inventory purchase",
        },
        {
          accountCode: AP_ACCOUNT,
          debit: 0,
          credit: fromMinor(invoiceTotalMinor),
          description: "Accounts payable - supplier",
        },
      ],
    );

    await tx.purchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "posted",
        postedByUserId: actorUserId ?? null,
        postedAt: new Date(),
      },
    });

    return { invoiceId: invoice.id, alreadyPosted: false };
  });
}

export async function createSupplierPaymentDraft(input: {
  supplierId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  referenceNumber?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  allocations: Array<{
    purchaseInvoiceId: string;
    amount: number;
  }>;
}) {
  const amount = requirePositiveMoney(input.amount, "payment amount");

  if (!input.paymentMethod.trim()) {
    throw new Error("Supplier payment method is required");
  }

  if (!input.allocations.length) {
    throw new Error(
      "Supplier payment requires allocations until supplier advances are implemented",
    );
  }

  const seen = new Set<string>();

  const allocations = input.allocations.map((allocation) => {
    if (seen.has(allocation.purchaseInvoiceId)) {
      throw new Error("Duplicate invoice allocation in supplier payment");
    }

    seen.add(allocation.purchaseInvoiceId);

    return {
      purchaseInvoiceId: allocation.purchaseInvoiceId,
      amount: requirePositiveMoney(allocation.amount, "allocation amount"),
    };
  });

  const allocatedMinor = allocations.reduce(
    (sum, allocation) => sum + toMinor(allocation.amount),
    0,
  );

  if (allocatedMinor !== toMinor(amount)) {
    throw new Error(
      "Supplier payment must be fully allocated until supplier advances are implemented",
    );
  }

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: {
        id: input.supplierId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!supplier) {
      throw new Error("Supplier not found or inactive");
    }

    await lockPurchaseInvoices(
      tx,
      allocations.map((allocation) => allocation.purchaseInvoiceId),
    );

    const invoices = await tx.purchaseInvoice.findMany({
      where: {
        id: {
          in: allocations.map((allocation) => allocation.purchaseInvoiceId),
        },
      },
      select: {
        id: true,
        supplierId: true,
        status: true,
      },
    });

    if (invoices.length !== allocations.length) {
      throw new Error("One or more purchase invoices do not exist");
    }

    for (const invoice of invoices) {
      if (invoice.supplierId !== supplier.id) {
        throw new Error("Cross-supplier payment allocation is not allowed");
      }

      if (invoice.status !== "posted") {
        throw new Error(
          "Supplier payments can only be allocated to posted invoices",
        );
      }
    }

    return tx.supplierPayment.create({
      data: {
        supplierId: supplier.id,
        amount: new Prisma.Decimal(amount),
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod.trim().toLowerCase(),
        referenceNumber: input.referenceNumber?.trim() || null,
        status: "draft",
        notes: input.notes?.trim() || null,
        createdByUserId: input.createdByUserId ?? null,

        allocations: {
          create: allocations.map((allocation) => ({
            purchaseInvoiceId: allocation.purchaseInvoiceId,
            amount: new Prisma.Decimal(allocation.amount),
          })),
        },
      },
      include: { allocations: true },
    });
  });
}

export async function postSupplierPayment(
  paymentId: string,
  actorUserId?: string | null,
) {
  return db.$transaction(
    async (tx) => {
      await lockSupplierPayment(tx, paymentId);

      const payment = await tx.supplierPayment.findUnique({
        where: { id: paymentId },
        include: { allocations: true },
      });

      if (!payment) {
        throw new Error("Supplier payment not found");
      }

      if (payment.status === "posted") {
        return { paymentId, alreadyPosted: true };
      }

      if (payment.status !== "draft") {
        throw new Error(
          `Supplier payment cannot be posted from status ${payment.status}`,
        );
      }

      const paymentMinor = toMinor(Number(payment.amount));

      if (paymentMinor <= 0) {
        throw new Error("Supplier payment amount must be greater than zero");
      }

      if (!payment.allocations.length) {
        throw new Error(
          "Supplier payment requires allocations until supplier advances are implemented",
        );
      }

      const invoiceIds = payment.allocations.map(
        (allocation) => allocation.purchaseInvoiceId,
      );

      await lockPurchaseInvoices(tx, invoiceIds);

      const invoices = await tx.purchaseInvoice.findMany({
        where: { id: { in: invoiceIds } },
        select: {
          id: true,
          supplierId: true,
          status: true,
          totalAmount: true,
        },
      });

      if (invoices.length !== new Set(invoiceIds).size) {
        throw new Error("One or more allocated purchase invoices do not exist");
      }

      const invoiceMap = new Map(
        invoices.map((invoice) => [invoice.id, invoice]),
      );

      const paymentAllocatedMinor = payment.allocations.reduce(
        (sum, allocation) => sum + toMinor(Number(allocation.amount)),
        0,
      );

      if (paymentAllocatedMinor !== paymentMinor) {
        throw new Error(
          "Supplier payment must be fully allocated until supplier advances are implemented",
        );
      }

      for (const allocation of payment.allocations) {
        const invoice = invoiceMap.get(allocation.purchaseInvoiceId);

        if (!invoice) {
          throw new Error("Allocated purchase invoice not found");
        }

        if (invoice.supplierId !== payment.supplierId) {
          throw new Error("Cross-supplier payment allocation is not allowed");
        }

        if (invoice.status !== "posted") {
          throw new Error(
            "Payment allocation target must be a posted purchase invoice",
          );
        }

        const prior = await tx.supplierPaymentAllocation.aggregate({
          where: {
            purchaseInvoiceId: invoice.id,
            supplierPayment: {
              status: "posted",
              id: { not: payment.id },
            },
          },
          _sum: { amount: true },
        });

        const previouslyPaidMinor = toMinor(Number(prior._sum.amount ?? 0));
        const invoiceTotalMinor = toMinor(Number(invoice.totalAmount));
        const outstandingMinor = invoiceTotalMinor - previouslyPaidMinor;
        const allocationMinor = toMinor(Number(allocation.amount));

        if (outstandingMinor <= 0) {
          throw new Error("Purchase invoice is already fully paid");
        }

        if (allocationMinor > outstandingMinor) {
          throw new Error(
            `Allocation exceeds purchase invoice outstanding balance`,
          );
        }
      }

      const paymentAccount = mapSupplierPaymentAccount(payment.paymentMethod);

      await postJournal(
        tx,
        "SupplierPayment",
        payment.id,
        `Supplier payment #${payment.id.slice(-8)}`,
        [
          {
            accountCode: AP_ACCOUNT,
            debit: fromMinor(paymentMinor),
            credit: 0,
            description: "Accounts payable settlement",
          },
          {
            accountCode: paymentAccount,
            debit: 0,
            credit: fromMinor(paymentMinor),
            description: "Supplier payment",
          },
        ],
      );

      await tx.supplierPayment.update({
        where: { id: payment.id },
        data: {
          status: "posted",
          postedByUserId: actorUserId ?? null,
          postedAt: new Date(),
        },
      });

      return { paymentId: payment.id, alreadyPosted: false };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

export async function cancelSupplierPayment(
  paymentId: string,
  actorUserId?: string | null,
) {
  return db.$transaction(async (tx) => {
    await lockSupplierPayment(tx, paymentId);

    const payment = await tx.supplierPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error("Supplier payment not found");
    }

    if (payment.status === "cancelled") {
      return { paymentId, alreadyCancelled: true };
    }

    if (payment.status !== "posted") {
      throw new Error("Only posted supplier payments can be cancelled");
    }

    const journal = await tx.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "SupplierPayment",
          referenceId: payment.id,
        },
      },
      select: { id: true },
    });

    if (!journal) {
      throw new Error("Supplier payment journal not found");
    }

    await reverseJournal(tx, journal.id);

    await tx.supplierPayment.update({
      where: { id: payment.id },
      data: {
        status: "cancelled",
        cancelledByUserId: actorUserId ?? null,
        cancelledAt: new Date(),
      },
    });

    return { paymentId: payment.id, alreadyCancelled: false };
  });
}

export async function cancelPurchaseInvoice(
  invoiceId: string,
  actorUserId?: string | null,
) {
  return db.$transaction(async (tx) => {
    await lockPurchaseInvoice(tx, invoiceId);

    const invoice = await tx.purchaseInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new Error("Purchase invoice not found");
    }

    if (invoice.status === "cancelled") {
      return { invoiceId, alreadyCancelled: true };
    }

    if (invoice.status !== "posted") {
      throw new Error("Only posted purchase invoices can be cancelled");
    }

    const postedAllocations = await tx.supplierPaymentAllocation.count({
      where: {
        purchaseInvoiceId: invoice.id,
        supplierPayment: {
          status: "posted",
        },
      },
    });

    if (postedAllocations > 0) {
      throw new Error(
        "Purchase invoice cannot be cancelled while posted supplier payments are allocated to it",
      );
    }

    const journal = await tx.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "PurchaseInvoice",
          referenceId: invoice.id,
        },
      },
      select: { id: true },
    });

    if (!journal) {
      throw new Error("Purchase invoice journal not found");
    }

    await reverseJournal(tx, journal.id);

    await tx.purchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "cancelled",
        cancelledByUserId: actorUserId ?? null,
        cancelledAt: new Date(),
      },
    });

    return { invoiceId: invoice.id, alreadyCancelled: false };
  });
}

export async function getPurchaseInvoiceBalance(invoiceId: string) {
  const invoice = await db.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      supplierId: true,
      status: true,
      totalAmount: true,
    },
  });

  if (!invoice) {
    throw new Error("Purchase invoice not found");
  }

  const paid = await db.supplierPaymentAllocation.aggregate({
    where: {
      purchaseInvoiceId: invoice.id,
      supplierPayment: {
        status: "posted",
      },
    },
    _sum: { amount: true },
  });

  const totalMinor = toMinor(Number(invoice.totalAmount));
  const paidMinor = toMinor(Number(paid._sum.amount ?? 0));
  const outstandingMinor = totalMinor - paidMinor;

  let paymentStatus: "unpaid" | "partially_paid" | "paid";

  if (paidMinor <= 0) {
    paymentStatus = "unpaid";
  } else if (outstandingMinor <= 0) {
    paymentStatus = "paid";
  } else {
    paymentStatus = "partially_paid";
  }

  return {
    invoiceId: invoice.id,
    supplierId: invoice.supplierId,
    documentStatus: invoice.status,
    totalAmount: fromMinor(totalMinor),
    paidAmount: fromMinor(paidMinor),
    outstandingAmount: fromMinor(outstandingMinor),
    paymentStatus,
  };
}
