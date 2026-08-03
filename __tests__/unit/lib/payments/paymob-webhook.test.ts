import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import crypto from "crypto";

// Prevent PrismaClient instantiation — db.ts reads DATABASE_URL at module load level
vi.mock("@/lib/db", () => ({
  db: {
    siteContent: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";

const TEST_SECRET = "test_hmac_secret_unit_tests_only";

function computeHmac(obj: Record<string, unknown>): string {
  const message = [
    String(obj.amount_cents ?? ""),
    String(obj.created_at ?? ""),
    String(obj.currency ?? ""),
    String(obj.error_occured ?? ""),
    String(obj.has_parent_transaction ?? ""),
    String(obj.id ?? ""),
    String(obj.integration_id ?? ""),
    String(obj.is_3d_secure ?? ""),
    String(obj.is_auth ?? ""),
    String(obj.is_capture ?? ""),
    String(obj.is_refunded ?? ""),
    String(obj.is_standalone_payment ?? ""),
    String(obj.is_voided ?? ""),
    String((obj.order as Record<string, unknown>)?.id ?? ""),
    String(obj.owner ?? ""),
    String(obj.pending ?? ""),
    String((obj.source_data as Record<string, unknown>)?.pan ?? ""),
    String((obj.source_data as Record<string, unknown>)?.sub_type ?? ""),
    String((obj.source_data as Record<string, unknown>)?.type ?? ""),
    String(obj.success ?? ""),
  ].join("");
  return crypto.createHmac("sha512", TEST_SECRET).update(message).digest("hex");
}

const baseTxObj = {
  amount_cents: 100000,
  created_at: "2024-01-15T10:30:00Z",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  id: 987654,
  integration_id: 5613515,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 111222, merchant_order_id: "test-transaction-id-001" },
  owner: 12345,
  pending: false,
  source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
  success: true,
};

describe("paymob handleWebhook — payload validation", () => {
  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = TEST_SECRET;
  });

  it("rejects payload with wrong type (ORDER instead of TRANSACTION)", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "ORDER", obj: baseTxObj },
      new Headers(),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unsupported");
  });

  it("rejects payload with missing obj", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION" },
      new Headers(),
    );
    expect(result.ok).toBe(false);
  });

  it("returns ok:false for null payload (no throw)", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(null, new Headers());
    expect(result.ok).toBe(false);
    expect(result.message).toBe("invalid_payload");
  });

  it("returns ok:false for non-object payload (string)", async () => {
    const result = await paymobPaymentProvider.handleWebhook!("raw string", new Headers());
    expect(result.ok).toBe(false);
    expect(result.message).toBe("invalid_payload");
  });

  it("returns ok:false for undefined payload", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(undefined, new Headers());
    expect(result.ok).toBe(false);
    expect(result.message).toBe("invalid_payload");
  });

  it("rejects when no transactionId in merchant_order_id or special_reference", async () => {
    const objNoId = {
      ...baseTxObj,
      order: { id: 111222, merchant_order_id: null },
    };
    const hmac = computeHmac(objNoId);
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: objNoId, hmac },
      new Headers(),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("merchant_order_id");
  });
});

describe("paymob handleWebhook — HMAC verification", () => {
  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = TEST_SECRET;
  });

  it("accepts a correct HMAC signature", async () => {
    const hmac = computeHmac(baseTxObj);
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj, hmac },
      new Headers(),
    );
    expect(result.ok).toBe(true);
    expect(result.transactionId).toBe("test-transaction-id-001");
  });

  it("rejects an incorrect HMAC (wrong value)", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj, hmac: "deadbeef" },
      new Headers(),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("HMAC");
  });

  it("rejects a tampered HMAC (correct length, wrong content)", async () => {
    const correct = computeHmac(baseTxObj);
    const tampered = correct[0] === "a"
      ? "b" + correct.slice(1)
      : "a" + correct.slice(1);
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj, hmac: tampered },
      new Headers(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a webhook without HMAC", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj },
      new Headers(),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MISSING_HMAC");
  });

  it("rejects an empty HMAC", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj, hmac: "" },
      new Headers(),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MISSING_HMAC");
  });

  it("accepts HMAC in uppercase (case-insensitive comparison)", async () => {
    const hmac = computeHmac(baseTxObj).toUpperCase();
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj, hmac },
      new Headers(),
    );
    expect(result.ok).toBe(true);
  });

  it("HMAC changes when transaction data is tampered", async () => {
    const originalHmac = computeHmac(baseTxObj);
    const tamperedObj = { ...baseTxObj, amount_cents: 1 };
    const tamperedHmac = computeHmac(tamperedObj);
    expect(originalHmac).not.toBe(tamperedHmac);
  });
});

describe("paymob handleWebhook — payment status mapping", () => {
  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = TEST_SECRET;
  });

  it("success=true + pending=false → paid", async () => {
    const txObj = { ...baseTxObj, success: true, pending: false };
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: txObj, hmac: computeHmac(txObj) },
      new Headers(),
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("paid");
  });

  it("error_occured=true → failed", async () => {
    const txObj = { ...baseTxObj, success: false, pending: false, error_occured: true };
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: txObj, hmac: computeHmac(txObj) },
      new Headers(),
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("failed");
  });

  it("success=false + pending=false → failed", async () => {
    const txObj = { ...baseTxObj, success: false, pending: false, error_occured: false };
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: txObj, hmac: computeHmac(txObj) },
      new Headers(),
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("failed");
  });

  it("success=false + pending=true → pending", async () => {
    const txObj = { ...baseTxObj, success: false, pending: true, error_occured: false };
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: txObj, hmac: computeHmac(txObj) },
      new Headers(),
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("pending");
  });

  it("extracts transactionId from merchant_order_id (priority over special_reference)", async () => {
    const txObj = {
      ...baseTxObj,
      order: { id: 111222, merchant_order_id: "primary-tx-id" },
      special_reference: "fallback-tx-id",
    };
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: txObj, hmac: computeHmac(txObj) },
      new Headers(),
    );
    expect(result.transactionId).toBe("primary-tx-id");
  });

  it("falls back to special_reference when merchant_order_id is null", async () => {
    const txObj = {
      ...baseTxObj,
      order: { id: 111222, merchant_order_id: null },
      special_reference: "fallback-tx-id",
    };
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: txObj, hmac: computeHmac(txObj) },
      new Headers(),
    );
    expect(result.transactionId).toBe("fallback-tx-id");
  });

  it("includes order.id as providerReference and obj.id as externalReference", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj, hmac: computeHmac(baseTxObj) },
      new Headers(),
    );
    expect(result.providerReference).toBe("111222");
    expect(result.externalReference).toBe("987654");
  });

  it("stores correct webhook payload fields", async () => {
    const result = await paymobPaymentProvider.handleWebhook!(
      { type: "TRANSACTION", obj: baseTxObj, hmac: computeHmac(baseTxObj) },
      new Headers(),
    );
    expect(result.payload).toMatchObject({
      webhookType: "TRANSACTION",
      success: true,
      pending: false,
      sourceType: "card",
      sourceSubtype: "MasterCard",
    });
  });
});
