import { describe, expect, it } from "vitest";
import { selectPaymobRecoveryPage } from "@/lib/payments/paymob-auto-recovery-paging";

describe("Paymob auto-recovery bounded paging", () => {
  it("returns the first page for an empty candidate set", () => {
    expect(selectPaymobRecoveryPage(0, 0)).toEqual({
      skip: 0, take: 25, page: 0, pages: 1,
    });
  });

  it("rotates across all pages at successive intervals", () => {
    expect(selectPaymobRecoveryPage(65, 0).page).toBe(0);
    expect(selectPaymobRecoveryPage(65, 300_000).page).toBe(1);
    expect(selectPaymobRecoveryPage(65, 600_000).page).toBe(2);
    expect(selectPaymobRecoveryPage(65, 900_000).page).toBe(0);
  });

  it("does not exceed the configured page size", () => {
    const page = selectPaymobRecoveryPage(1000, 300_000, 30);
    expect(page.take).toBe(30);
    expect(page.skip).toBe(30);
  });

  it("rejects invalid or unbounded paging", () => {
    expect(() => selectPaymobRecoveryPage(-1, 0)).toThrow();
    expect(() => selectPaymobRecoveryPage(5, 0, 101)).toThrow();
    expect(() => selectPaymobRecoveryPage(5, Number.NaN)).toThrow();
  });
});
