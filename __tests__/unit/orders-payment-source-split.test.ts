import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  createPaymentTransaction: vi.fn(),
  restorePaymentBalanceAdjustments: vi.fn(),

  productFindMany: vi.fn(),
  productVariantFindMany: vi.fn(),
  walletFindUnique: vi.fn(),
  walletUpdate: vi.fn(),
  walletTransactionCreate: vi.fn(),
  siteContentFindUnique: vi.fn(),
  rewardPointsFindUnique: vi.fn(),
  rewardPointsUpdate: vi.fn(),
  rewardHistoryCreate: vi.fn(),
  deliveryOptionFindFirst: vi.fn(),
  notificationCreate: vi.fn(),

  transaction: vi.fn(),
  txOrderCreate: vi.fn(),
  txOrderUpdate: vi.fn(),

  cookies: vi.fn(),

  getStoreCampaignSettings: vi.fn(),
  grantStoreGiftClaimAtomic: vi.fn(),

  reserveOrderInventoryOwnedFirst: vi.fn(),
  releaseOrderInventoryAllocations: vi.fn(),

  recordCheckoutStarted: vi.fn(),

  sendStoreOrderEmail: vi.fn(),
  sendAdminOrderNotification: vi.fn(),
  generateStoreOrderInvoicePdf: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/payments/service", () => ({
  createPaymentTransaction:
    mocks.createPaymentTransaction,
  restorePaymentBalanceAdjustments:
    mocks.restorePaymentBalanceAdjustments,
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,

    product: {
      findMany: mocks.productFindMany,
    },

    productVariant: {
      findMany: mocks.productVariantFindMany,
    },

    wallet: {
      findUnique: mocks.walletFindUnique,
      update: mocks.walletUpdate,
    },

    walletTransaction: {
      create: mocks.walletTransactionCreate,
    },

    siteContent: {
      findUnique: mocks.siteContentFindUnique,
    },

    rewardPoints: {
      findUnique: mocks.rewardPointsFindUnique,
      update: mocks.rewardPointsUpdate,
    },

    rewardHistory: {
      create: mocks.rewardHistoryCreate,
    },

    deliveryOption: {
      findFirst: mocks.deliveryOptionFindFirst,
    },

    notification: {
      create: mocks.notificationCreate,
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock(
  "@/app/api/admin/store-gift-campaign/route",
  () => ({
    getStoreCampaignSettings:
      mocks.getStoreCampaignSettings,
  }),
);

vi.mock("@/lib/store-gift-reward-service", () => ({
  grantStoreGiftClaimAtomic:
    mocks.grantStoreGiftClaimAtomic,
}));

vi.mock(
  "@/lib/order-inventory-allocation-service",
  () => ({
    InventoryReservationConflictError:
      class InventoryReservationConflictError
        extends Error {},
    reserveOrderInventoryOwnedFirst:
      mocks.reserveOrderInventoryOwnedFirst,
    releaseOrderInventoryAllocations:
      mocks.releaseOrderInventoryAllocations,
  }),
);

vi.mock("@/lib/analytics/checkout-events", () => ({
  recordCheckoutStarted:
    mocks.recordCheckoutStarted,
}));

vi.mock("@/lib/email", () => ({
  sendStoreOrderEmail:
    mocks.sendStoreOrderEmail,
  sendAdminOrderNotification:
    mocks.sendAdminOrderNotification,
}));

vi.mock("@/lib/store-order-invoice", () => ({
  generateStoreOrderInvoicePdf:
    mocks.generateStoreOrderInvoicePdf,
}));

import { POST } from "@/app/api/orders/route";

function request() {
  return new Request(
    "http://localhost/api/orders",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            productId: "product-1",
            quantity: 1,
          },
        ],
        paymentMethod: "paymob",
        walletDeduct: 40,
        pointsDeduct: 0,
      }),
    },
  );
}

describe(
  "orders Paymob wallet source split",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getCurrentAppUser.mockResolvedValue({
        id: "user-1",
        name: "Test User",
        email: null,
      });

      mocks.cookies.mockResolvedValue({
        get: vi.fn(() => undefined),
      });

      mocks.productFindMany.mockResolvedValue([
        {
          id: "product-1",
          price: 100,
          vatEnabled: false,
          isActive: true,
        },
      ]);

      mocks.productVariantFindMany
        .mockResolvedValue([]);

      mocks.walletFindUnique.mockResolvedValue({
        balance: 200,
        referralBalance: 100,
      });

      mocks.walletUpdate.mockResolvedValue({
        id: "wallet-1",
        balance: 160,
        referralBalance: 100,
      });

      mocks.walletTransactionCreate
        .mockResolvedValue({ id: "wallet-tx-1" });

      mocks.siteContentFindUnique
        .mockResolvedValue(null);

      mocks.notificationCreate
        .mockResolvedValue({ id: "notification-1" });

      mocks.txOrderCreate.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        businessUnit: "store",
        subtotal: 100,
        discountTotal: 40,
        shippingFee: 0,
        total: 60,
        status: "pending",
        paymentMethod: "paymob",
        items: [
          {
            productId: "product-1",
            quantity: 1,
            price: 100,
          },
        ],
      });

      mocks.txOrderUpdate.mockResolvedValue({
        id: "order-1",
        status: "cancelled",
      });

      mocks.transaction.mockImplementation(
        async (
          callback: (
            tx: unknown,
          ) => unknown,
        ) =>
          callback({
            order: {
              create: mocks.txOrderCreate,
              update: mocks.txOrderUpdate,
            },
          }),
      );

      mocks.reserveOrderInventoryOwnedFirst
        .mockResolvedValue(undefined);

      mocks.releaseOrderInventoryAllocations
        .mockResolvedValue(undefined);

      mocks.getStoreCampaignSettings
        .mockResolvedValue({
          isActive: false,
        });

      mocks.grantStoreGiftClaimAtomic
        .mockResolvedValue(undefined);

      mocks.recordCheckoutStarted
        .mockResolvedValue(undefined);

      mocks.restorePaymentBalanceAdjustments
        .mockResolvedValue(undefined);
    });

    it(
      "persists store wallet deduction as general-only Paymob metadata",
      async () => {
        mocks.createPaymentTransaction
          .mockResolvedValue({
            id: "payment-1",
            status: "pending",
            checkoutUrl:
              "https://example.test/pay",
          });

        const response = await POST(request());

        expect(response.status).toBe(200);

        expect(
          mocks.createPaymentTransaction,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.createPaymentTransaction,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user-1",
            provider: "paymob",
            purpose: "order",
            businessUnit: "store",
            orderId: "order-1",
            metadata: expect.objectContaining({
              paymentAdjustments:
                expect.objectContaining({
                  walletAmount: 40,
                  referralWalletAmount: 0,
                  generalWalletAmount: 40,
                }),
            }),
          }),
        );

        expect(
          mocks.walletTransactionCreate,
        ).toHaveBeenCalledWith({
          data: expect.objectContaining({
            amount: 40,
            type: "debit",
            source: "general",
          }),
        });

        expect(
          mocks.restorePaymentBalanceAdjustments,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "restores the same general-only split when Paymob initialization fails",
      async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => undefined);

        try {
          mocks.createPaymentTransaction
            .mockRejectedValue(
              new Error("PAYMOB_INIT_FAILED"),
            );

          const response = await POST(request());

          expect(response.status).toBe(502);

          expect(
            mocks.releaseOrderInventoryAllocations,
          ).toHaveBeenCalledTimes(1);

          expect(
            mocks.restorePaymentBalanceAdjustments,
          ).toHaveBeenCalledTimes(1);

          expect(
            mocks.restorePaymentBalanceAdjustments,
          ).toHaveBeenCalledWith({
            userId: "user-1",
            walletAmount: 40,
            referralWalletAmount: 0,
            generalWalletAmount: 40,
            pointsCount: 0,
            reference: "order-1",
          });
        } finally {
          errorSpy.mockRestore();
        }
      },
    );
  },
);