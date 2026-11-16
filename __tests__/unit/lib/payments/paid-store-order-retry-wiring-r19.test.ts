import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/payments/service.ts"),
  "utf8",
);

describe("R19 paid Store order recovery wiring", () => {
  it("reuses one order finalization helper from initial and paid retry paths", () => {
    expect(source).toContain("R19_PAID_STORE_ORDER_CRASH_RECOVERY_V1");

    const calls = source.match(/await ensurePaidStoreOrderFinalized\(/g) ?? [];
    expect(calls).toHaveLength(2);

    expect(source).toContain(
      "await ensurePaidStoreOrderFinalized(current.orderId)",
    );
    expect(source).toContain(
      "await ensurePaidStoreOrderFinalized(existing.orderId)",
    );
  });

  it("keeps sale claim, inventory and GL together in the original transaction", () => {
    const start = source.indexOf(
      "async function ensurePaidStoreOrderFinalized(",
    );
    const end = source.indexOf(
      "export async function updatePaymentTransactionStatus(",
      start,
    );

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const helper = source.slice(start, end);

    expect(helper).toContain("await db.$transaction(");
    expect(helper).toContain("tx.order.updateMany(");
    expect(helper).toContain("confirmOrderInventoryAllocationSale(");
    expect(helper).toContain("postAllocatedSaleJournal(");
    expect(helper).toContain('status: "pending"');
    expect(helper).toContain("inventoryDeducted: true");
  });
});