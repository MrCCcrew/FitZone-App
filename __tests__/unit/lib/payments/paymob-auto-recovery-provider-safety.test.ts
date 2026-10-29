import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/payments/settings", () => ({
  getPaymentSettings: vi.fn(),
}));

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed: vi.fn(),
}));

import { getPaymentSettings } from "@/lib/payments/settings";
import {
  inquirePaidPaymobOrderAttemptsForRecovery,
} from "@/lib/payments/providers/paymob";

const orderId = 631854294;
const paymentId = "payment-1";

const successful = {
  id: 553643635,
  success: true,
  pending: false,
  error_occured: false,
  is_voided: false,
  is_refunded: false,
  refunded_amount_cents: 0,
  amount_cents: 34300,
  currency: "EGP",
  order: { id: orderId },
};

const baseOrder = {
  id: orderId,
  merchant_order_id: paymentId,
  amount_cents: 34300,
  paid_amount_cents: 34300,
  currency: "EGP",
  transactions: [
    { ...successful, id: 553643634, success: false },
    successful,
  ],
};

function response(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

describe("Paymob Order multi-attempt provider safety", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMOB_API_KEY", "fitzone-unit-test-dummy-key");
    vi.mocked(getPaymentSettings).mockResolvedValue({
      apiKey: "test-api-key",
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  async function run(order: unknown, inquiryOverride?: unknown) {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ token: "test-token" }))
      .mockResolvedValueOnce(response(
        inquiryOverride ?? {
          id: 553643634,
          success: false,
          order: {
            id: orderId,
            merchant_order_id: paymentId,
          },
        },
      ))
      .mockResolvedValueOnce(response(order));

    vi.stubGlobal("fetch", fetchMock);

    const result =
      await inquirePaidPaymobOrderAttemptsForRecovery(paymentId, null);

    expect(fetchMock).toHaveBeenCalledTimes(
      inquiryOverride === undefined ? 3 : 2,
    );
    return result;
  }

  it("finds one successful attempt after a failed attempt", async () => {
    const result = await run(baseOrder);

    expect(result.status).toBe("paid");
    expect(result.paymobTransactionId).toBe("553643635");
    expect(result.merchantOrderId).toBe(paymentId);
    expect(result.amountCents).toBe(34300);
  });

  it.each([
    ["refunded", {
      ...baseOrder,
      transactions: [{ ...successful, is_refunded: true }],
    }],
    ["partially refunded", {
      ...baseOrder,
      transactions: [{ ...successful, refunded_amount_cents: 100 }],
    }],
    ["voided", {
      ...baseOrder,
      transactions: [{ ...successful, is_voided: true }],
    }],
    ["two successful charges", {
      ...baseOrder,
      paid_amount_cents: 68600,
      transactions: [
        successful,
        { ...successful, id: 553643636 },
      ],
    }],
    ["wrong merchant reference", {
      ...baseOrder,
      merchant_order_id: "another-payment",
    }],
    ["wrong order amount", {
      ...baseOrder,
      amount_cents: 99900,
    }],
    ["no transaction list", {
      ...baseOrder,
      transactions: undefined,
    }],
  ])("rejects %s", async (_label, order) => {
    const result = await run(order);
    expect(result.status).not.toBe("paid");
    expect(result.paymobTransactionId).toBeNull();
  });

  it("rejects unrelated merchant inquiry", async () => {
    const result = await run(baseOrder, {
      id: 553643634,
      order: {
        id: orderId,
        merchant_order_id: "another-payment",
      },
    });

    expect(result.status).not.toBe("paid");
  });
});
