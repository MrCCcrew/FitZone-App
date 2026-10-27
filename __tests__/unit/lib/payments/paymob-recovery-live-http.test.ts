import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed: vi.fn(),
}));

import {
  confirmPaymobOrderPaidForRecovery,
  verifyPaymobTransactionForRecovery,
} from "@/lib/payments/providers/paymob";

const paymentId = "synthetic-fitzone-payment";
const orderId = 631854294;
const transactionId = "553643635";
const amount = 343;

const validOrder = {
  id: orderId,
  merchant_order_id: paymentId,
  amount_cents: 34300,
  paid_amount_cents: 34300,
  currency: "EGP",
  is_cancel: false,
  is_canceled: false,
  is_return: false,
  is_returned: false,
};

const validAcceptance = {
  id: Number(transactionId),
  success: true,
  pending: false,
  error_occured: false,
  is_refunded: false,
  is_voided: false,
  refunded_amount_cents: 0,
  amount_cents: 34300,
  currency: "EGP",
  order: {
    id: orderId,
    merchant_order_id: paymentId,
  },
};

const recoveryInput = {
  paymentId,
  paymobOrderId: orderId,
  paymobTransactionId: transactionId,
  amount,
  currency: "EGP",
};

type Scenario = {
  order?: unknown;
  acceptance?: unknown;
  orderStatus?: number;
  acceptanceStatus?: number;
};

function mockProviderHttp(scenario: Scenario = {}) {
  const order =
    scenario.order === undefined
      ? validOrder
      : scenario.order;

  const acceptance =
    scenario.acceptance === undefined
      ? validAcceptance
      : scenario.acceptance;

  const fetchMock = vi.fn(
    async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname;

      if (path === "/api/auth/tokens") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({ token: "synthetic-auth-token" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (
        path === `/api/ecommerce/orders/${orderId}`
      ) {
        expect(init?.method).toBe("GET");

        return new Response(
          JSON.stringify(order),
          {
            status: scenario.orderStatus ?? 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (
        path ===
        `/api/acceptance/transactions/${transactionId}`
      ) {
        // fetch defaults to GET when method is omitted.
        expect((init?.method ?? "GET").toUpperCase()).toBe("GET");

        return new Response(
          JSON.stringify(acceptance),
          {
            status: scenario.acceptanceStatus ?? 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error("UNEXPECTED_PROVIDER_HTTP_REQUEST");
    },
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

beforeEach(() => {
  // Synthetic credentials only. No real Paymob requests.
  vi.stubEnv("PAYMOB_API_KEY", "synthetic-paymob-api-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Paymob recovery HTTP integration with mocked provider", () => {
  it("accepts matching live Order and Acceptance responses", async () => {
    const fetchMock = mockProviderHttp();

    await expect(
      confirmPaymobOrderPaidForRecovery(recoveryInput),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      "different Acceptance transaction ID",
      { acceptance: { ...validAcceptance, id: 553643636 } },
    ],
    [
      "failed Acceptance transaction",
      { acceptance: { ...validAcceptance, success: false } },
    ],
    [
      "pending Acceptance transaction",
      { acceptance: { ...validAcceptance, pending: true } },
    ],
    [
      "refunded Acceptance transaction",
      { acceptance: { ...validAcceptance, is_refunded: true } },
    ],
    [
      "voided Acceptance transaction",
      { acceptance: { ...validAcceptance, is_voided: true } },
    ],
    [
      "partially refunded Acceptance transaction",
      {
        acceptance: {
          ...validAcceptance,
          refunded_amount_cents: 100,
        },
      },
    ],
    [
      "different Acceptance amount",
      { acceptance: { ...validAcceptance, amount_cents: 100 } },
    ],
    [
      "different Acceptance currency",
      { acceptance: { ...validAcceptance, currency: "USD" } },
    ],
    [
      "different Acceptance Order ID",
      {
        acceptance: {
          ...validAcceptance,
          order: { ...validAcceptance.order, id: 1 },
        },
      },
    ],
    [
      "different Acceptance merchant reference",
      {
        acceptance: {
          ...validAcceptance,
          order: {
            ...validAcceptance.order,
            merchant_order_id: "other-payment",
          },
        },
      },
    ],
    [
      "different Order merchant reference",
      { order: { ...validOrder, merchant_order_id: "other-payment" } },
    ],
    [
      "different Order amount",
      { order: { ...validOrder, amount_cents: 100 } },
    ],
    [
      "double captured amount",
      { order: { ...validOrder, paid_amount_cents: 68600 } },
    ],
    [
      "cancelled Order",
      { order: { ...validOrder, is_canceled: true } },
    ],
    [
      "returned Order",
      { order: { ...validOrder, is_returned: true } },
    ],
    [
      "malformed transaction list",
      { order: { ...validOrder, transactions: null } },
    ],
    [
      "missing Order",
      { orderStatus: 404 },
    ],
    [
      "unavailable Acceptance",
      { acceptanceStatus: 503 },
    ],
  ] as const)(
    "rejects %s",
    async (_label, scenario) => {
      mockProviderHttp(scenario);

      await expect(
        confirmPaymobOrderPaidForRecovery(recoveryInput),
      ).resolves.toBe(false);
    },
  );

  it("keeps the legacy single-transaction proof", async () => {
    const fetchMock = mockProviderHttp({
      order: {
        ...validOrder,
        transactions: [validAcceptance],
      },
    });

    await expect(
      confirmPaymobOrderPaidForRecovery(recoveryInput),
    ).resolves.toBe(true);

    // Legacy path needs auth + Order, not a second Acceptance fetch.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects multiple successful transactions in legacy proof", async () => {
    mockProviderHttp({
      order: {
        ...validOrder,
        transactions: [
          validAcceptance,
          { ...validAcceptance, id: 553643636 },
        ],
      },
    });

    await expect(
      confirmPaymobOrderPaidForRecovery(recoveryInput),
    ).resolves.toBe(false);
  });

  it("verifies the exact Acceptance transaction identity", async () => {
    mockProviderHttp();

    const result = await verifyPaymobTransactionForRecovery(
      transactionId,
      paymentId,
      amount,
      "EGP",
      "synthetic-reference",
    );

    expect(result.verified).toBe(true);
    expect(result.transactionId).toBe(transactionId);
  });

  it("rejects a different Acceptance ID during remote verification", async () => {
    mockProviderHttp({
      acceptance: {
        ...validAcceptance,
        id: 553643636,
      },
    });

    const result = await verifyPaymobTransactionForRecovery(
      transactionId,
      paymentId,
      amount,
      "EGP",
      "synthetic-reference",
    );

    expect(result.verified).toBe(false);
    expect(result.failureReason).toContain(
      "transaction_id_mismatch",
    );
  });
});
