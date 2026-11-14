import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Paymob paid activation date preservation", () => {
  it("preserves the original membership dates when repairing paid activation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/payments/service.ts"),
      "utf8",
    );

    const start = source.indexOf(
      "export async function recoverPaidMembershipActivation(",
    );
    const end = source.indexOf(
      "export async function recoverVerifiedPaymobPayment(",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const section = source.slice(start, end);

    expect(section).toMatch(
      /activatePaidMembershipTx\(\s*tx,\s*paymentTransactionId,\s*payment\.membershipId!,\s*\{\s*preserveExistingDates:\s*true\s*\}/,
    );
  });
});
