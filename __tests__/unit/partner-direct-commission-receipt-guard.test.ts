import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findCommission: vi.fn(),
  transaction: vi.fn(),
  settle: vi.fn(),
  r2Send: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.auth,
}));

vi.mock("@/lib/db", () => ({
  db: {
    partnerCommission: {
      findUnique: mocks.findCommission,
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

import { PATCH } from "@/app/api/admin/partner-commissions/route";

const receiptUrl = "/api/admin/partner-receipts/1760000000000-550e8400-e29b-41d4-a716-446655440000.jpg";

function request(receipt?: string) {
  return new Request("http://localhost/api/admin/partner-commissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "commission-fixture",
      status: "paid",
      ...(receipt === undefined ? {} : { receiptUrl: receipt }),
    }),
  });
}

describe("Partner direct commission receipt guard", () => {
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

    mocks.findCommission.mockResolvedValue({
      id: "commission-fixture",
      partnerId: "partner-fixture",
      status: "pending",
      withdrawnAt: null,
    });

    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ partnerCommission: { update: vi.fn() } }),
    );

    mocks.settle.mockResolvedValue({
      payout: { id: "payout-fixture" },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects payment without a receipt", async () => {
    const response = await PATCH(request());
    expect(response?.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only receipts", async () => {
    const response = await PATCH(request("   "));
    expect(response?.status).toBe(400);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("rejects external receipt URLs", async () => {
    const response = await PATCH(
      request("https://other.test/partners/receipt.jpg"),
    );
    expect(response?.status).toBe(400);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("propagates an allowed receipt URL into payout", async () => {
    const response = await PATCH(request(receiptUrl));
    expect(response?.status).toBe(200);

    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        commissionType: "partner",
        beneficiaryId: "partner-fixture",
        commissionIds: ["commission-fixture"],
        receiptUrl,
        receiptSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });
});
