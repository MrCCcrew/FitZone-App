import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Private Session earning service contract", () => {
  const source = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/lib/employees/private-session-earning-service.ts",
    ),
    "utf8",
  );

  it("uses PrivateSessionApplication as exact-once locked source", () => {
    expect(source).toContain("PrivateSessionApplication");

    expect(source).toContain("FOR UPDATE");

    expect(source).toContain("privateSessionApplicationId");
  });

  it("uses paid PaymentTransaction amount as financial base", () => {
    expect(source).toContain('payment.status !== "paid"');

    expect(source).toContain('payment.purpose !== "private_session"');

    expect(source).toContain("Number(payment.amount)");
  });

  it("uses privateSessionCommissionBps from effective coach compensation", () => {
    expect(source).toContain("privateSessionCommissionBps");

    expect(source).toContain("coachCompensationTerm.findFirst");

    expect(source).toContain("effectiveFrom");

    expect(source).toContain("effectiveTo");
  });

  it("blocks missing HR configuration instead of throwing payment failure", () => {
    expect(source).toContain(
      "PRIVATE_SESSION_EARNING_TRAINER_EMPLOYEE_LINK_MISSING",
    );

    expect(source).toContain(
      "PRIVATE_SESSION_EARNING_EMPLOYEE_PAYROLL_DISABLED",
    );

    expect(source).toContain(
      "PRIVATE_SESSION_EARNING_COMPENSATION_TERM_MISSING",
    );

    expect(source).toContain('? "blocked"');
  });

  it("allows blocked earning to be retried while calculated/finalized is frozen", () => {
    expect(source).toContain('existing.status !== "blocked"');

    expect(source).toContain("privateSessionEarning.update");
  });

  it("has idempotent transactional finalize", () => {
    expect(source).toContain("finalizePrivateSessionEarning");

    expect(source).toContain('row.status === "finalized"');

    expect(source).toContain("private_session_earning_finalize");
  });

  it("does not touch referral commission settlement", () => {
    expect(source).not.toContain("TrainerCommission");

    expect(source).not.toContain("CommissionPayout");

    expect(source).not.toContain("commissionSettlement");
  });
});
