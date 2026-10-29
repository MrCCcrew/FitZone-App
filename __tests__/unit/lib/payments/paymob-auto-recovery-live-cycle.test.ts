import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cycle: vi.fn(),
  discover: vi.fn(),
  batch: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/payments/paymob-auto-recovery-cycle", () => ({
  runPaymobRecoveryCycle: mocks.cycle,
}));

vi.mock("@/lib/payments/paymob-auto-recovery-discovery-db", () => ({
  discoverPaymobRecoveryJobs: mocks.discover,
}));

vi.mock("@/lib/payments/paymob-auto-recovery-batch", () => ({
  runDuePaymobRecoveryBatch: mocks.batch,
}));

vi.mock("@/lib/payments/paymob-auto-recovery-db-runner", () => ({
  executePersistedPaymobRecoveryJob: mocks.execute,
}));

import {
  runRealPaymobRecoveryCycle,
} from "@/lib/payments/paymob-auto-recovery-live-cycle";

describe("Paymob real cycle dependency wiring", () => {
  it("does nothing on import and wires bounded execution", async () => {
    expect(mocks.cycle).not.toHaveBeenCalled();
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();

    mocks.cycle.mockImplementationOnce(async deps => {
      expect(deps.discover).toBe(mocks.discover);
      await deps.executeBatch();
      return { ok: true };
    });

    mocks.batch.mockResolvedValue({
      selected: 0,
      succeeded: 0,
      failed: 0,
    });

    expect(await runRealPaymobRecoveryCycle()).toEqual({ ok: true });

    const args = mocks.batch.mock.calls[0][0];
    expect(args.limit).toBe(10);
    expect(args.execute).toBe(mocks.execute);
  });
});
