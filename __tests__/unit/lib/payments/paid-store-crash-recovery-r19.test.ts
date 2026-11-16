import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyRemote: vi.fn(),
  friendPaid: vi.fn(),
  findPayment: vi.fn(),
  findOrder: vi.fn(),
  transaction: vi.fn(),
  orderClaim: vi.fn(),
  inventorySale: vi.fn(),
  saleJournal: vi.fn(),
}));

type OrderState = {
  status: string;
  inventoryDeducted: boolean;
  confirmedAt: Date | null;
};

let orderState: OrderState;
let committedSales: number;
let failJournalOnce: boolean;

const payment = {
  id: "payment-r19-recovery",
  userId: null,
  orderId: "order-r19-recovery",
  membershipId: null,
  offerId: null,
  purpose: "order",
  provider: "paymob",
  businessUnit: "store",
  status: "paid",
  amount: 100,
  currency: "EGP",
  paymentMethod: "paymob",
  providerReference: "intention-r19",
  externalReference: "12345678",
  providerPayload: null,
  metadata: null,
  paidAt: new Date("2026-11-16T12:00:00Z"),
  createdAt: new Date("2026-11-16T11:00:00Z"),
  updatedAt: new Date("2026-11-16T12:00:00Z"),
};

vi.mock("@/lib/db", () => ({
  asDbTransactionClient: (value: unknown) => value,
  db: {
    paymentTransaction: {
      findUnique: mocks.findPayment,
    },
    order: {
      findUnique: mocks.findOrder,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/payments/registry", () => ({
  getPaymentProvider: () => ({
    verifyTransaction: mocks.verifyRemote,
  }),
  getDefaultPaymentProvider: () => ({
    verifyTransaction: mocks.verifyRemote,
  }),
  listPaymentProviders: () => [],
}));

vi.mock("@/lib/payments/friend-offer-payment", () => ({
  markFriendOfferParticipantPaid: mocks.friendPaid,
}));

vi.mock("@/lib/order-inventory-allocation-service", () => ({
  confirmOrderInventoryAllocationSale: mocks.inventorySale,
}));

vi.mock("@/lib/accounting-service", () => ({
  postAllocatedSaleJournal: mocks.saleJournal,
  postPromotionalPointsGrantJournal: vi.fn(),
  postPromotionalWalletCreditJournal: vi.fn(),
}));

import { updatePaymentTransactionStatus } from "@/lib/payments/service";

describe("R19 paid Store crash recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    orderState = {
      status: "pending",
      inventoryDeducted: false,
      confirmedAt: null,
    };

    committedSales = 0;
    failJournalOnce = true;

    mocks.findPayment.mockImplementation(async () => ({ ...payment }));

    mocks.verifyRemote.mockResolvedValue({
      status: "paid",
      externalReference: payment.externalReference,
      providerReference: payment.providerReference,
    });

    mocks.friendPaid.mockResolvedValue(undefined);

    mocks.findOrder.mockImplementation(async () => ({
      ...orderState,
      total: 100,
      subtotal: 100,
      shippingFee: 0,
      discountTotal: 0,
      paymentMethod: "paymob",
      address: null,
      deliveryLabel: null,
      isClubPickup: false,
      items: [],
    }));

    mocks.inventorySale.mockResolvedValue([
      {
        ownedCost: 40,
        consignmentCost: 0,
      },
    ]);

    mocks.saleJournal.mockImplementation(async () => {
      if (failJournalOnce) {
        failJournalOnce = false;
        throw new Error("SIMULATED_GL_COMMIT_FAILURE");
      }
      return "journal-r19";
    });

    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        // Transactional working copy: rollback on error.
        const working: OrderState = { ...orderState };

        const tx = {
          order: {
            updateMany: async ({ where, data }: {
              where: { id: string; status: string };
              data: {
                status: string;
                inventoryDeducted: boolean;
                confirmedAt: Date;
              };
            }) => {
              mocks.orderClaim();

              if (
                where.id !== payment.orderId ||
                working.status !== where.status
              ) {
                return { count: 0 };
              }

              working.status = data.status;
              working.inventoryDeducted = data.inventoryDeducted;
              working.confirmedAt = data.confirmedAt;

              return { count: 1 };
            },
          },
        };

        const result = await callback(tx);

        // Only a successful transaction commits its working copy.
        orderState = working;
        committedSales += 1;

        return result;
      },
    );
  });

  it("rolls back a failed sale, repairs it on paid retry, then stays idempotent", async () => {
    await expect(
      updatePaymentTransactionStatus(payment.id, "paid"),
    ).rejects.toThrow("SIMULATED_GL_COMMIT_FAILURE");

    expect(orderState.status).toBe("pending");
    expect(orderState.inventoryDeducted).toBe(false);
    expect(committedSales).toBe(0);
    expect(mocks.inventorySale).toHaveBeenCalledTimes(1);
    expect(mocks.saleJournal).toHaveBeenCalledTimes(1);

    await updatePaymentTransactionStatus(payment.id, "paid");

    expect(orderState.status).toBe("confirmed");
    expect(orderState.inventoryDeducted).toBe(true);
    expect(orderState.confirmedAt).toBeInstanceOf(Date);
    expect(committedSales).toBe(1);
    expect(mocks.inventorySale).toHaveBeenCalledTimes(2);
    expect(mocks.saleJournal).toHaveBeenCalledTimes(2);

    await updatePaymentTransactionStatus(payment.id, "paid");

    // Third paid signal must not repeat inventory or journal.
    expect(committedSales).toBe(1);
    expect(mocks.inventorySale).toHaveBeenCalledTimes(2);
    expect(mocks.saleJournal).toHaveBeenCalledTimes(2);
    expect(mocks.orderClaim).toHaveBeenCalledTimes(2);

    // Every paid signal still requires provider verification.
    expect(mocks.verifyRemote).toHaveBeenCalledTimes(3);
  });
});