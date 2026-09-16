import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Coach Membership economic finalization wiring", () => {
  const subscribe = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/subscribe/route.ts"),
    "utf8",
  );

  const reconciliation = fs.readFileSync(
    path.join(process.cwd(), "src/lib/payments/reconciliation-helper.ts"),
    "utf8",
  );

  it("accrues immediate Coach Membership inside the subscription transaction", () => {
    expect(subscribe).toContain("await accrueCoachMembershipEarningTx(");

    expect(subscribe).toContain("walletAmount: actualWalletDeduct");

    expect(subscribe).toContain("pointsAmount: actualPointsEGP");

    expect(subscribe).toContain("externalPaidAmount: 0");
  });

  it("accrues paid Coach Membership inside authoritative reconciliation", () => {
    expect(reconciliation).toContain("await accrueCoachMembershipEarningTx(");

    expect(reconciliation).toContain("walletAmount: redeemedWalletAmount");

    expect(reconciliation).toContain("pointsAmount: redeemedPointsAmount");

    expect(reconciliation).toContain("Number(paymentAmount ?? 0)");
  });

  it("uses paidAt for Paymob month attribution when available", () => {
    expect(reconciliation).toContain("finalizedAt: paidAt ?? new Date()");
  });

  it("does not route Coach Membership through referral settlement", () => {
    expect(subscribe).not.toContain("coachMembershipEarning.create");

    expect(reconciliation).not.toContain("coachMembershipEarning.create");
  });
});
