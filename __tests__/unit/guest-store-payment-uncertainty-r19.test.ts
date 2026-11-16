import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("R19 payment uncertainty compensation guards", () => {
  const orders = read("src/app/api/orders/route.ts");
  const intent = read("src/app/api/payments/order-intent/route.ts");

  it("does not release a store order with a committed payment", () => {
    const start = orders.indexOf(
      "R19_PAYMENT_UNCERTAINTY_GUARD_V1",
    );
    const section = orders.slice(start, orders.indexOf(
      "} else if (total > 0 && paymentMethod ===",
      start,
    ));

    expect(start).toBeGreaterThan(-1);
    expect(section).toContain(
      "db.paymentTransaction.findFirst({",
    );
    expect(section).toContain(
      "where: { orderId: order.id }",
    );
    expect(section).toContain("if (committedPayment)");
    expect(section).toContain(
      '"PAYMENT_RECONCILIATION_REQUIRED"',
    );

    const guard = section.indexOf("if (committedPayment)");
    const release = section.indexOf(
      "await releaseOrderInventoryAllocations(",
    );
    const restore = section.indexOf(
      "await restorePaymentBalanceAdjustments(",
    );

    expect(release).toBeGreaterThan(guard);
    expect(restore).toBeGreaterThan(guard);
    expect(section.slice(guard, release)).toContain(
      "return NextResponse.json(",
    );
    expect(section.slice(guard, release)).toContain(
      "{ status: 503 }",
    );
  });

  it("preserves order-intent balance when a payment exists", () => {
    const start = intent.indexOf(
      "R19_PAYMENT_UNCERTAINTY_GUARD_V1",
    );
    expect(start).toBeGreaterThan(-1);

    const restore = intent.indexOf(
      "await restorePaymentBalanceAdjustments(",
      start,
    );
    const body = intent.slice(start, restore);

    expect(body).toContain(
      "db.paymentTransaction.findFirst({",
    );
    expect(body).toContain(
      "where: { orderId: order.id }",
    );
    expect(body).toContain("if (committedPayment)");
    expect(body).toContain(
      'throw new Error("PAYMENT_RECONCILIATION_REQUIRED")',
    );
  });

  it("keeps guest Paymob disabled pending financial release", () => {
    expect(orders).toContain(
      'isGuest && paymentMethod !== "cod"',
    );
    expect(orders).toContain(
      "GUEST_PAYMOB",
    );
  });
});