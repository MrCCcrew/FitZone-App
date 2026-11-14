import { describe, expect, it, vi } from "vitest";
import { savePaymobRecoveryCheckpoint } from "@/lib/payments/paymob-auto-recovery-checkpoint";

describe("Paymob recovery checkpoint CAS", () => {
  it("advances only the observed version", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const cursor = {
      createdAt: new Date("2026-10-29T10:00:00Z"),
      id: "payment-7",
    };
    expect(await savePaymobRecoveryCheckpoint(
      { paymobRecoveryScanState: { updateMany } },
      { id: "membership-paymob", expectedVersion: 3, cursor },
    )).toBe(true);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "membership-paymob", version: 3,
    });
    expect(updateMany.mock.calls[0][0].data).toEqual({
      cursorCreatedAt: cursor.createdAt,
      cursorPaymentId: "payment-7",
      version: { increment: 1 },
    });
  });

  it("detects competing updates without claiming success", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    expect(await savePaymobRecoveryCheckpoint(
      { paymobRecoveryScanState: { updateMany } },
      { id: "membership-paymob", expectedVersion: 2, cursor: null },
    )).toBe(false);
  });

  it("resets cursor at the end of a complete scan", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await savePaymobRecoveryCheckpoint(
      { paymobRecoveryScanState: { updateMany } },
      { id: "membership-paymob", expectedVersion: 4, cursor: null },
    );
    expect(updateMany.mock.calls[0][0].data.cursorPaymentId).toBeNull();
  });

  it("rejects invalid cursor before any DB operation", async () => {
    const updateMany = vi.fn();
    await expect(savePaymobRecoveryCheckpoint(
      { paymobRecoveryScanState: { updateMany } },
      { id: "membership-paymob", expectedVersion: -1, cursor: null },
    )).rejects.toThrow("INVALID_RECOVERY_CHECKPOINT");
    expect(updateMany).not.toHaveBeenCalled();
  });
});
