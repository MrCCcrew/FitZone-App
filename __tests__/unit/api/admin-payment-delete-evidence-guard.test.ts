import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  feature: vi.fn(),
  master: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  legacyDelete: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.feature,
  requireAdminMasterAccess: mocks.master,
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: mocks.findUnique,
      deleteMany: mocks.deleteMany,
      delete: mocks.legacyDelete,
    },
  },
}));

vi.mock("@/lib/payments/service", () => ({
  listRecentPaymentTransactions: vi.fn(),
  verifyPaymentTransaction: vi.fn(),
}));

import { DELETE } from "@/app/api/admin/payments/route";

const req = (transactionId = "transaction-123") =>
  new Request("https://example.test/api/admin/payments", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactionId }),
  });

describe("Financial evidence retention in admin payment DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feature.mockResolvedValue({ session: { user: { id: "admin-a" } } });
    mocks.master.mockResolvedValue({ ok: true });
    mocks.findUnique.mockResolvedValue({
      id: "transaction-123",
      provider: "manual",
      status: "failed",
    });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("does not delete Paymob records even when marked failed", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "transaction-123",
      provider: "paymob",
      status: "failed",
    });
    const result = await DELETE(req());
    expect(result.status).toBe(409);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.legacyDelete).not.toHaveBeenCalled();
  });

  it("never deletes a paid transaction from any provider", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "transaction-123",
      provider: "manual",
      status: "paid",
    });
    const result = await DELETE(req());
    expect(result.status).toBe(409);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("CAS-deletes only a still-failed non-Paymob record", async () => {
    const result = await DELETE(req());
    expect(result.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "transaction-123", provider: "manual", status: "failed" },
    });
    expect(mocks.legacyDelete).not.toHaveBeenCalled();
  });

  it("fails closed when a concurrent transaction changes state", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    const result = await DELETE(req());
    expect(result.status).toBe(409);
  });

  it("requires master payment authorization", async () => {
    const { NextResponse } = await import("next/server");
    mocks.master.mockResolvedValue({
      error: NextResponse.json({ error: "Master password required" }, { status: 423 }),
    });
    const result = await DELETE(req());
    expect(result.status).toBe(423);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
