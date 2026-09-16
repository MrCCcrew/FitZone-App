import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Private Session earning admin API wiring", () => {
  const permissions = fs.readFileSync(
    path.join(process.cwd(), "src/lib/admin-permissions.ts"),
    "utf8",
  );

  const api = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/app/api/admin/private-session-earnings/route.ts",
    ),
    "utf8",
  );

  it("registers granular private-session earning permissions", () => {
    expect(permissions).toContain('"private_session_earning_view"');

    expect(permissions).toContain('"private_session_earning_calculate"');

    expect(permissions).toContain('"private_session_earning_finalize"');
  });

  it("guards GET with view permission", () => {
    expect(api).toContain("requireAdminPermission(");

    expect(api).toContain('"private_session_earning_view"');
  });

  it("guards calculate and finalize separately", () => {
    expect(api).toContain('"private_session_earning_calculate"');

    expect(api).toContain('"private_session_earning_finalize"');

    expect(api).toContain('action !== "calculate"');

    expect(api).toContain('action !== "finalize"');
  });

  it("recalculates only from official source identity", () => {
    expect(api).toContain("accruePrivateSessionEarningTx");

    expect(api).toContain("privateSessionApplicationId");

    expect(api).not.toContain("paymentAmountMinor:");

    expect(api).not.toContain("commissionRateBps:");
  });

  it("supports blocked calculated finalized filters", () => {
    expect(api).toContain('"blocked"');

    expect(api).toContain('"calculated"');

    expect(api).toContain('"finalized"');

    expect(api).toContain("PRIVATE_SESSION_EARNING_INVALID_STATUS");
  });

  it("prevents recalculation of finalized earning", () => {
    expect(api).toContain('existing.status === "finalized"');

    expect(api).toContain("PRIVATE_SESSION_EARNING_ALREADY_FINALIZED");
  });
});
