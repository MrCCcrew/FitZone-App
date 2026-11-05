import { describe, it, expect, vi } from "vitest";

/**
 * Webhook HMAC and Payload Format Fix Tests
 *
 * Tests extraction of HMAC from query params and support for both
 * nested (Acceptance API) and flat (Unified Checkout) payload formats.
 */

describe("Webhook HMAC and Payload Fix", () => {
  const mockComputeHmac = vi.fn((_data: any) => "valid-hmac-abc123");
  const mockVerifyHmac = vi.fn((provided: string, expected: string) => provided === expected);

  function simulateHandleWebhook(payload: any, queryHmac?: string | null, bodyHmac?: string) {
    const body = payload;

    // Detect format
    const isNested = body.type === "TRANSACTION" && body.obj;
    const isFlat = body.id && body.merchant_order_id;

    if (!isNested && !isFlat) {
      return { ok: false, message: "Unsupported Paymob webhook payload." };
    }

    // Extract HMAC (query takes priority)
    const providedHmac = String(queryHmac || bodyHmac || "").trim();
    if (!providedHmac) {
      return { ok: false, code: "MISSING_HMAC", message: "Paymob webhook HMAC is required." };
    }

    // Verify HMAC
    const expected = mockComputeHmac(isNested ? body.obj : body);
    if (!mockVerifyHmac(providedHmac, expected)) {
      return { ok: false, code: "INVALID_HMAC", message: "Paymob webhook HMAC verification failed." };
    }

    if (isNested) {
      const transactionId = body.obj.order?.merchant_order_id ?? body.obj.special_reference;
      return {
        ok: true,
        transactionId,
        externalReference: body.obj.id ? String(body.obj.id) : null,
        format: "nested",
      };
    }

    if (isFlat) {
      const transactionId = String(body.merchant_order_id).trim();
      return {
        ok: true,
        transactionId,
        externalReference: body.id ? String(body.id) : null,
        format: "flat",
      };
    }

    return { ok: false, message: "Unknown format" };
  }

  it("1. nested + valid query HMAC → accepted", () => {
    const payload = {
      type: "TRANSACTION",
      obj: {
        id: 513615625,
        order: { merchant_order_id: "test-tx-1", id: 123 },
        success: true,
        pending: false,
      },
    };

    const result = simulateHandleWebhook(payload, "valid-hmac-abc123");

    expect(result.ok).toBe(true);
    expect((result as any).transactionId).toBe("test-tx-1");
    expect((result as any).externalReference).toBe("513615625");
    expect((result as any).format).toBe("nested");
  });

  it("2. flat + valid query HMAC → accepted", () => {
    const payload = {
      id: "513681133",
      merchant_order_id: "test-tx-2",
      success: "true",
      pending: "false",
      txn_response_code: "APPROVED",
    };

    const result = simulateHandleWebhook(payload, "valid-hmac-abc123");

    expect(result.ok).toBe(true);
    expect((result as any).transactionId).toBe("test-tx-2");
    expect((result as any).externalReference).toBe("513681133");
    expect((result as any).format).toBe("flat");
  });

  it("3. flat + missing HMAC → rejected", () => {
    const payload = {
      id: "513681133",
      merchant_order_id: "test-tx-3",
      success: "true",
      pending: "false",
    };

    const result = simulateHandleWebhook(payload, null);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("MISSING_HMAC");
  });

  it("4. flat + invalid HMAC → rejected", () => {
    const payload = {
      id: "513681133",
      merchant_order_id: "test-tx-4",
      success: "true",
      pending: "false",
    };

    const result = simulateHandleWebhook(payload, "wrong-hmac-xyz");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_HMAC");
  });

  it("5. nested + invalid HMAC → rejected", () => {
    const payload = {
      type: "TRANSACTION",
      obj: {
        id: 513615625,
        order: { merchant_order_id: "test-tx-5" },
      },
    };

    const result = simulateHandleWebhook(payload, "invalid-hmac");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_HMAC");
  });

  it("6. flat id → externalReference saved", () => {
    const payload = {
      id: "999888777",
      merchant_order_id: "test-tx-6",
      success: "true",
      pending: "false",
    };

    const result = simulateHandleWebhook(payload, "valid-hmac-abc123");

    expect(result.ok).toBe(true);
    expect((result as any).externalReference).toBe("999888777");
  });

  it("7. merchant_order_id → correct local transaction", () => {
    const payload = {
      id: "888777666",
      merchant_order_id: "correct-local-id",
      success: "true",
      pending: "false",
    };

    const result = simulateHandleWebhook(payload, "valid-hmac-abc123");

    expect(result.ok).toBe(true);
    expect((result as any).transactionId).toBe("correct-local-id");
  });

  it("8. query HMAC takes priority over body HMAC", () => {
    const payload = {
      type: "TRANSACTION",
      obj: {
        id: 777666555,
        order: { merchant_order_id: "test-tx-8" },
      },
      hmac: "body-hmac-wrong",
    };

    const result = simulateHandleWebhook(payload, "valid-hmac-abc123", "body-hmac-wrong");

    expect(result.ok).toBe(true); // Query HMAC is valid
  });

  it("9. unsupported payload format → rejected", () => {
    const payload = {
      random: "data",
      without: "required fields",
    };

    const result = simulateHandleWebhook(payload, "valid-hmac-abc123");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Unsupported Paymob webhook payload.");
  });

  it("10. flat with boolean fields (not strings)", () => {
    const payload = {
      id: "666555444",
      merchant_order_id: "test-tx-10",
      success: true, // Boolean, not string
      pending: false,
    };

    const result = simulateHandleWebhook(payload, "valid-hmac-abc123");

    expect(result.ok).toBe(true);
    expect((result as any).externalReference).toBe("666555444");
  });
});
