import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findWithdrawal: vi.fn(),
  findCommissions: vi.fn(),
  transaction: vi.fn(),
  settle: vi.fn(),
  r2Send: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.auth,
}));

vi.mock("@/lib/db", () => ({
  db: {
    partnerWithdrawalRequest: {
      findUnique: mocks.findWithdrawal,
    },
    partnerCommission: {
      findMany: mocks.findCommissions,
    },
    $transaction: mocks.transaction,
  },
  asDbTransactionClient: (tx: unknown) => tx,
}));

vi.mock("@/lib/commissions/commission-settlement-service", () => ({
  settleCommissionsTx: mocks.settle,
}));

vi.mock("@/lib/r2", () => ({
  R2_BUCKET: "fitzone-public-images-test",
  getR2Client: () => ({ send: mocks.r2Send }),
}));

import { PATCH } from "@/app/api/admin/partner-withdrawals/route";

function request(receiptUrl?: string) {
  return new Request(
    "http://localhost/api/admin/partner-withdrawals",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "withdrawal-fixture",
        status: "approved",
        ...(receiptUrl !== undefined ? { receiptUrl } : {}),
      }),
    },
  );
}

describe("Partner withdrawal financial receipt guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // PRIVATE_RECEIPT_TEST_FIXTURE_V3
    vi.stubEnv(
      "R2_PRIVATE_RECEIPTS_BUCKET_NAME",
      "fitzone-private-receipts-test",
    );
    mocks.r2Send.mockResolvedValue({
      ContentType: "image/jpeg",
      ContentLength: 4,
      Body: {
        transformToByteArray: async () =>
          Uint8Array.from([255, 216, 255, 217]),
      },
    });


    mocks.auth.mockResolvedValue({
      role: "admin",
      session: { user: { id: "admin-fixture" } },
    });

    mocks.findWithdrawal.mockResolvedValue({
      id: "withdrawal-fixture",
      partnerId: "partner-fixture",
      amount: 250,
      status: "pending",
      receiptUrl: null,
      adminNotes: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    });

    mocks.findCommissions.mockResolvedValue([
      { id: "commission-fixture", amount: 250 },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects paid status without payment evidence", async () => {
    const response = await PATCH(request() as never);
    if (!response) throw new Error("PATCH_DID_NOT_RETURN_RESPONSE");

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(
      "إثبات الصرف",
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only payment evidence", async () => {
    const response = await PATCH(request("   ") as never);
    if (!response) throw new Error("PATCH_DID_NOT_RETURN_RESPONSE");

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("preserves an existing receipt in payout and withdrawal", async () => {
    const receiptUrl = "/api/admin/partner-receipts/1760000000000-550e8400-e29b-41d4-a716-446655440000.jpg";
    const withdrawalUpdate = vi.fn().mockResolvedValue({});

    mocks.findWithdrawal.mockResolvedValueOnce({
      id: "withdrawal-fixture",
      partnerId: "partner-fixture",
      amount: 250,
      status: "pending",
      receiptUrl,
      adminNotes: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    });

    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          partnerWithdrawalRequest: {
            update: withdrawalUpdate,
          },
        }),
    );

    mocks.settle.mockResolvedValue({});

    const response = await PATCH(request() as never);
    if (!response) throw new Error("PATCH_DID_NOT_RETURN_RESPONSE");

    expect(response.status).toBe(200);

    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receiptUrl,
        receiptSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );

    expect(withdrawalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ receiptUrl }),
      }),
    );
  });
});
