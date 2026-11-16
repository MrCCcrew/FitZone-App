/**
 * FITZONE_R19_GUEST_ORDER_INVENTORY_ATOMICITY_V1
 *
 * Source-wiring regression only.
 *
 * This is NOT a database integration or HTTP E2E test.
 * It protects transaction boundaries from accidental refactoring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("R19 guest order transaction wiring", () => {
  const route = source("src/app/api/orders/route.ts");
  const claim = source("src/lib/store-guest-proof-claim.ts");
  const inventory = source(
    "src/lib/order-inventory-allocation-service.ts",
  );

  it("creates order, claims OTP and reserves stock in the same transaction", () => {
    const start = route.indexOf(
      "const order = await db.$transaction(async (tx) => {",
    );
    expect(start).toBeGreaterThan(-1);

    const end = route.indexOf(
      "}, { timeout: 10000 });",
      start,
    );
    expect(end).toBeGreaterThan(start);

    const body = route.slice(start, end);

    const orderIndex = body.indexOf("await tx.order.create({");
    const proofIndex = body.indexOf(
      "await claimGuestCheckoutProof(tx, {",
    );
    const stockIndex = body.indexOf(
      "await reserveOrderInventoryOwnedFirst(",
    );

    expect(orderIndex).toBeGreaterThan(-1);
    expect(proofIndex).toBeGreaterThan(orderIndex);
    expect(stockIndex).toBeGreaterThan(proofIndex);

    // A failed claim or reservation must propagate out of the transaction.
    expect(
      body.slice(proofIndex, stockIndex),
    ).not.toMatch(/\bcatch\s*\(/);
    expect(
      body.slice(stockIndex),
    ).not.toMatch(/\bcatch\s*\(/);
  });

  it("requires a single conditional OTP claim", () => {
    expect(claim).toContain("consumedAt: null");
    expect(claim).toContain("orderId: null");
    expect(claim).toContain("nonceHash,");
    expect(claim).toContain("expiresAt:");
    expect(claim).toContain("gt: now");
    expect(claim).toContain("result.count !== 1");
    expect(claim).toContain("throw new GuestCheckoutProofError()");
  });

  it("uses compare-and-set on owned stock", () => {
    const reserveStart = inventory.indexOf(
      "export async function reserveOrderInventoryOwnedFirst(",
    );
    const releaseStart = inventory.indexOf(
      "export async function releaseOrderInventoryAllocations(",
    );
    expect(reserveStart).toBeGreaterThan(-1);
    expect(releaseStart).toBeGreaterThan(reserveStart);

    const reserve = inventory.slice(reserveStart, releaseStart);

    expect(reserve).toContain("stock: product.stock");
    expect(reserve).toContain("reservedStock: product.reservedStock");
    expect(reserve).toContain("ownedUpdated.count !== 1");
    expect(reserve).toContain(
      "throw new InventoryReservationConflictError()",
    );
    expect(reserve).toContain(
      'status: "reserved"',
    );
  });

  it("does not bypass reserved inventory duplicate guard", () => {
    const reserveStart = inventory.indexOf(
      "export async function reserveOrderInventoryOwnedFirst(",
    );
    const releaseStart = inventory.indexOf(
      "export async function releaseOrderInventoryAllocations(",
    );
    const reserve = inventory.slice(reserveStart, releaseStart);

    expect(reserve).toContain(
      "tx.orderInventoryAllocation.count({",
    );
    expect(reserve).toContain("if (existing > 0)");
    expect(reserve).toContain(
      "tx.orderInventoryAllocation.create({",
    );
  });
});