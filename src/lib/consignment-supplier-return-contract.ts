export type ConsignmentReturnLotSnapshot = {
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  quantityReturned: number;
  status: string;
};

export function calculateConsignmentSupplierReturn(
  lot: ConsignmentReturnLotSnapshot,
  quantity: number,
) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Return quantity must be a positive integer");
  }

  const fields = [
    lot.quantityAvailable,
    lot.quantityReserved,
    lot.quantitySold,
    lot.quantityReturned,
  ];

  if (
    fields.some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    ) ||
    lot.quantityReserved > lot.quantityAvailable
  ) {
    throw new Error("Invalid consignment lot inventory state");
  }

  if (lot.status !== "open") {
    throw new Error("Consignment lot is not open for returns");
  }

  const unreserved = lot.quantityAvailable - lot.quantityReserved;

  if (quantity > unreserved) {
    throw new Error(
      "Return quantity exceeds unreserved consignment inventory",
    );
  }

  const afterAvailable = lot.quantityAvailable - quantity;
  const afterReturned = lot.quantityReturned + quantity;

  if (!Number.isSafeInteger(afterReturned)) {
    throw new Error("Consignment returned quantity overflow");
  }

  return {
    quantityBefore: lot.quantityAvailable,
    quantityAfter: afterAvailable,
    quantityReturnedAfter: afterReturned,
    quantityReservedAfter: lot.quantityReserved,
    quantitySoldAfter: lot.quantitySold,
    statusAfter:
      afterAvailable === 0
        ? lot.quantitySold === 0
          ? "returned"
          : "depleted"
        : "open",
  } as const;
}