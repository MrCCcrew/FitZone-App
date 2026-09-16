import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Private Session earning admin UI wiring", () => {
  const ui = fs.readFileSync(
    path.join(process.cwd(), "src/app/admin/sections/EmployeesHR.tsx"),
    "utf8",
  );

  it("registers tab and permissions", () => {
    expect(ui).toContain('"private-session-earnings"');

    expect(ui).toContain('"private_session_earning_view"');

    expect(ui).toContain('"private_session_earning_calculate"');

    expect(ui).toContain('"private_session_earning_finalize"');
  });

  it("loads using official admin API", () => {
    expect(ui).toContain("/api/admin/private-session-earnings");

    expect(ui).toContain('params.set("month", privateSessionEarningMonth)');

    expect(ui).toContain(
      'params.set("employeeId", privateSessionEarningEmployeeId)',
    );

    expect(ui).toContain('params.set("status", privateSessionEarningStatus)');
  });

  it("renders three lifecycle states", () => {
    expect(ui).toContain('<option value="blocked">متوقف</option>');

    expect(ui).toContain('<option value="calculated">محسوب</option>');

    expect(ui).toContain('<option value="finalized">معتمد</option>');

    expect(ui).toContain("row.blockReason");
  });

  it("recalculates blocked only", () => {
    expect(ui).toContain("runPrivateSessionCalculate");

    expect(ui).toContain('row.status === "blocked"');

    expect(ui).toContain('action: "calculate"');
  });

  it("finalizes calculated only", () => {
    expect(ui).toContain("runPrivateSessionFinalize");

    expect(ui).toContain('row.status === "calculated"');

    expect(ui).toContain('action: "finalize"');
  });

  it("contains no editable financial number fields", () => {
    const start = ui.indexOf("PRIVATE_SESSION_EARNING_RENDER_START");

    const end = ui.indexOf("PRIVATE_SESSION_EARNING_RENDER_END");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const block = ui.slice(start, end);

    expect(block).toContain("row.paymentAmountMinor");

    expect(block).toContain("row.commissionRateBps");

    expect(block).toContain("row.commissionAmountMinor");

    expect(block).not.toContain('type="number"');
  });
});
