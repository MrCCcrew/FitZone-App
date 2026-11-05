import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  coordinate: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    paymobRecoveryScanState: {
      upsert: mocks.upsert,
    },
  },
}));

vi.mock("@/lib/payments/paymob-auto-recovery-coordinator", () => ({
  coordinatePaymobRecoveryDiscovery: mocks.coordinate,
}));

vi.mock("@/lib/payments/paymob-auto-recovery-scanner", () => ({
  scanPaymobRecoveryCandidates: vi.fn(),
}));

vi.mock("@/lib/payments/paymob-auto-recovery-materializer", () => ({
  materializePaymobRecoveryCandidates: vi.fn(),
}));

vi.mock("@/lib/payments/paymob-auto-recovery-checkpoint", () => ({
  savePaymobRecoveryCheckpoint: vi.fn(),
}));

import {
  discoverPaymobRecoveryJobs,
} from "@/lib/payments/paymob-auto-recovery-discovery-db";

describe("Paymob discovery database adapter", () => {
  it("restores a saved cursor and version", async () => {
    const date = new Date("2026-10-29T10:00:00Z");

    mocks.upsert.mockResolvedValue({
      id: "membership-paymob",
      version: 4,
      cursorCreatedAt: date,
      cursorPaymentId: "payment-9",
    });

    mocks.coordinate.mockImplementation(async deps => {
      expect(await deps.readCheckpoint()).toEqual({
        version: 4,
        cursor: { createdAt: date, id: "payment-9" },
      });
      return { pages: 0 };
    });

    await discoverPaymobRecoveryJobs();
    expect(mocks.coordinate).toHaveBeenCalledOnce();
  });

  it("rejects half-written cursor state", async () => {
    mocks.upsert.mockResolvedValue({
      version: 2,
      cursorCreatedAt: new Date(),
      cursorPaymentId: null,
    });

    await expect(discoverPaymobRecoveryJobs())
      .rejects.toThrow("INCOMPLETE_PAYMOB_RECOVERY_CURSOR");
  });
});
