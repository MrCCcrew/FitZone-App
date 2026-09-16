import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Private Session earning payment wiring", () => {
  const service = fs.readFileSync(
    path.join(process.cwd(), "src/lib/payments/service.ts"),
    "utf8",
  );

  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/private-sessions/pay/route.ts"),
    "utf8",
  );

  it("wires webhook paid private finalization through shared reconciliation helper", () => {
    expect(service).toContain(
      "async function reconcilePaidPrivateSessionApplication",
    );

    const privateBlock = service.slice(
      service.indexOf("if (privateSessionApplicationId)"),
      service.indexOf("// Mark nutrition session as paid"),
    );

    expect(privateBlock).toContain(
      "await reconcilePaidPrivateSessionApplication({",
    );

    expect(privateBlock).toContain("privateSessionApplicationId");
  });

  it("updates paid application before accrual inside shared reconciliation transaction", () => {
    const helperStart = service.indexOf(
      "async function reconcilePaidPrivateSessionApplication",
    );

    const helperEnd = service.indexOf(
      "export async function updatePaymentTransactionStatus",
      helperStart,
    );

    const helperBlock = service.slice(helperStart, helperEnd);

    expect(helperBlock).toContain("await db.$transaction(async (tx) =>");

    const updateIndex = helperBlock.indexOf(
      "tx.privateSessionApplication.updateMany",
    );

    const accrueIndex = helperBlock.indexOf("accruePrivateSessionEarningTx");

    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(accrueIndex).toBeGreaterThan(updateIndex);

    expect(helperBlock).toContain('status: "paid"');
    expect(helperBlock).toContain("paymentTransactionId: transactionId");
    expect(helperBlock).toContain("asDbTransactionClient(tx)");
  });

  it("wires immediate-paid route transactionally", () => {
    const immediate = route.slice(
      route.indexOf('if (result.status === "paid")'),
    );

    expect(immediate).toContain("await db.$transaction(async (tx) =>");

    expect(immediate).toContain("tx.privateSessionApplication.update");

    expect(immediate).toContain("paymentTransactionId: result.id");

    expect(immediate).toContain("await accruePrivateSessionEarningTx(");

    expect(immediate).toContain("asDbTransactionClient(tx)");
  });

  it("keeps pending external checkout linked without accrual", () => {
    const paidStart = route.indexOf('if (result.status === "paid")');

    expect(paidStart).toBeGreaterThanOrEqual(0);

    const pendingUpdateStart = route.indexOf(
      "await db.privateSessionApplication.update(",
      paidStart,
    );

    expect(pendingUpdateStart).toBeGreaterThan(paidStart);

    const pendingTail = route.slice(pendingUpdateStart);

    expect(pendingTail).toContain("paymentTransactionId: result.id");

    expect(pendingTail).toContain("redirectUrl:");
  });

  it("does not swallow earning integrity errors", () => {
    const helperStart = service.indexOf(
      "async function reconcilePaidPrivateSessionApplication",
    );

    const helperEnd = service.indexOf(
      "export async function updatePaymentTransactionStatus",
      helperStart,
    );

    const helperBlock = service.slice(helperStart, helperEnd);

    const serviceAccrueStart = helperBlock.indexOf(
      "await accruePrivateSessionEarningTx(",
    );

    expect(serviceAccrueStart).toBeGreaterThanOrEqual(0);

    const serviceAccrueClose = helperBlock.indexOf("});", serviceAccrueStart);

    expect(serviceAccrueClose).toBeGreaterThan(serviceAccrueStart);

    const serviceAccrueCall = helperBlock.slice(
      serviceAccrueStart,
      serviceAccrueClose + 3,
    );

    expect(serviceAccrueCall).not.toContain(".catch(");

    const immediate = route.slice(
      route.indexOf('if (result.status === "paid")'),
    );

    const routeAccrueStart = immediate.indexOf(
      "await accruePrivateSessionEarningTx(",
    );

    expect(routeAccrueStart).toBeGreaterThanOrEqual(0);

    const routeAccrueClose = immediate.indexOf("});", routeAccrueStart);

    expect(routeAccrueClose).toBeGreaterThan(routeAccrueStart);

    const routeAccrueCall = immediate.slice(
      routeAccrueStart,
      routeAccrueClose + 3,
    );

    expect(routeAccrueCall).not.toContain(".catch(");

    expect(immediate).toContain(
      "ensurePrivateAttendancePass(app.id).catch(() => null)",
    );
  });
});
