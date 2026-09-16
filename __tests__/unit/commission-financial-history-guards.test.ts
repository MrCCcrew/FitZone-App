import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("commission financial-history guards", () => {
  it("partner admin delete deactivates instead of hard deleting", () => {
    const source = read("src/app/api/admin/partners/route.ts");

    expect(source).toContain('action: "deactivate"');
    expect(source).toContain("isActive: false");
    expect(source).toContain("showOnPublicPage: false");

    const deleteBlock = source.slice(
      source.indexOf("export async function DELETE"),
    );

    expect(deleteBlock).not.toContain("db.partner.delete(");
  });

  it("sales agent and contracts manager delete paths deactivate instead of hard deleting", () => {
    const source = read("src/app/api/admin/contracts/route.ts");

    const deleteBlock = source.slice(
      source.indexOf("// ─── DELETE"),
    );

    expect(deleteBlock).toContain("contractsManager.update");
    expect(deleteBlock).toContain("salesAgent.update");
    expect(deleteBlock).toContain("isActive: false");

    expect(deleteBlock).not.toContain("contractsManager.delete(");
    expect(deleteBlock).not.toContain("salesAgent.delete(");
  });

  it("manager settlement only settles earned commissions and includes partner-manager commissions", () => {
    const source = read("src/app/api/admin/contracts/route.ts");

    const start = source.indexOf(
      'if (body.action === "settle_manager_commissions")',
    );
    const end = source.indexOf("// Update partner", start);
    const block = source.slice(start, end);

    expect(block).toContain("managerCommission.updateMany");
    expect(block).toContain("managerPartnerCommission.updateMany");

    const earnedMatches = block.match(/status:\s*"earned"/g) ?? [];
    expect(earnedMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("sales agent settlement does not rewrite already-settled commissions", () => {
    const source = read("src/app/api/admin/contracts/route.ts");

    const start = source.indexOf(
      'if (body.action === "settle_commissions")',
      source.indexOf("// Update/settle agent"),
    );

    const block = source.slice(start, start + 900);

    expect(block).toContain("salesAgentCommission.updateMany");
    expect(block).toContain('status: "earned"');
    expect(block).toContain('status: "settled"');
  });

  it("generic DB maintenance cannot delete financial history roots", () => {
    const source = read(
      "src/app/api/admin/db-maintenance/records/route.ts",
    );

    expect(source).toContain("protectedFinancialTypes");

    for (const type of [
      '"memberships"',
      '"plans"',
      '"users"',
      '"partners"',
      '"partnerCommissions"',
      '"partnerWithdrawals"',
    ]) {
      expect(source).toContain(type);
    }
  });

  it("accounting membership delete checks all commission families before deletion", () => {
    const source = read("src/app/api/admin/accounting/route.ts");

    const start = source.indexOf(
      'if (body.entityType === "userMembership")',
    );

    const block = source.slice(start, start + 3600);

    for (const commission of [
      "partnerCommission",
      "agentCommission",
      "salesAgentCommission",
      "staffCommission",
      "trainerCommission",
      "nutritionCommission",
      "managerCommission",
      "managerPartnerCommission",
    ]) {
      expect(block).toContain(commission);
    }

    expect(block).toContain("hasCommissionHistory");
    expect(block).toContain("{ status: 409 }");
  });

  it("used membership plans cannot delete historical UserMembership records", () => {
    const source = read("src/lib/admin-linked-cleanup.ts");

    expect(source).toContain("if (linkedMemberships.length > 0)");
    expect(source).toContain(
      "لا يمكن حذف هذه الباقة لأنها مستخدمة في اشتراكات عملاء تاريخية",
    );

    const guardIndex = source.indexOf(
      "if (linkedMemberships.length > 0)",
    );
    const deleteIndex = source.indexOf(
      "await tx.userMembership.deleteMany",
    );

    // deleteMany belongs to the generic helper above, so additionally prove
    // the plan flow invokes the guard before calling the helper.
    const planFlowStart = source.indexOf(
      "export async function deleteMembershipAndLinkedClientData",
    );
    const helperCallIndex = source.indexOf(
      "cleanupUserMembershipRecords(",
      planFlowStart,
    );

    expect(guardIndex).toBeGreaterThan(planFlowStart);
    expect(helperCallIndex).toBeGreaterThan(guardIndex);
    expect(deleteIndex).toBeGreaterThan(-1);
  });

  it("customer delete deactivates users with financial/history records", () => {
    const source = read("src/app/api/admin/customers/route.ts");

    const deleteStart = source.indexOf(
      "export async function DELETE",
    );

    const block = source.slice(deleteStart);

    expect(block).toContain("const hasHistory");
    expect(block).toContain("_count.memberships");
    expect(block).toContain("_count.paymentTransactions");
    expect(block).toContain("_count.agentCommissions");
    expect(block).toContain("_count.staffCommissions");
    expect(block).toContain("_count.trainerCommissions");
    expect(block).toContain("_count.nutritionCommissions");

    expect(block).toContain("partnerProfile");
    expect(block).toContain("salesAgent");
    expect(block).toContain("contractsManager");

    expect(block).toContain("isActive: false");
    expect(block).toContain('action: "deactivate"');
  });

  it("partner withdrawn commissions cannot be reopened through generic PATCH", () => {
    for (const file of [
      "src/app/api/admin/partner-commissions/route.ts",
      "src/app/api/partner/commissions/route.ts",
    ]) {
      const source = read(file);

      expect(source).toContain(
        'existing.status === "withdrawn" && body.status === "pending"',
      );

      expect(source).toContain("{ status: 409 }");
    }
  });

  it("withdrawal approval is bounded to commissions existing at request creation time", () => {
    const source = read(
      "src/app/api/admin/partner-withdrawals/route.ts",
    );

    expect(source).toContain(
      "createdAt: { lte: existing.createdAt }",
    );

    expect(source).toContain("eligibleAmount");
    expect(source).toContain("requestedAmount");

    expect(source).toContain(
      "eligibleAmount !== requestedAmount",
    );

    expect(source).toContain(
      "id: { in: eligibleCommissions.map",
    );
  });
});

describe("staff trainer nutrition financial-history protection", () => {
  it("staff referral-link deletion preserves commission through SetNull", () => {
    const schema = read("prisma/schema.prisma");
    const start = schema.indexOf("model StaffCommission {");
    const block = schema.slice(start, start + 1400);

    expect(block).toContain("staffReferralLink");
    expect(block).toContain("onDelete: SetNull");
    expect(block).toContain("staffUserId");
  });

  it("trainer referral-link deletion preserves commission through SetNull", () => {
    const schema = read("prisma/schema.prisma");
    const start = schema.indexOf("model TrainerCommission {");
    const block = schema.slice(start, start + 1500);

    expect(block).toContain("trainerReferralLink");
    expect(block).toContain("onDelete: SetNull");
    expect(block).toContain("trainerUserId");
  });

  it("nutrition attribution relations preserve commission through SetNull", () => {
    const schema = read("prisma/schema.prisma");
    const start = schema.indexOf("model NutritionCommission {");
    const block = schema.slice(start, start + 1800);

    expect(block).toContain("nutritionReferralLink");
    expect(block).toContain("userMembership");
    expect(block).toContain("nutritionSession");

    expect(
      (block.match(/onDelete:\s*SetNull/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("nutrition settlement only changes earned commissions", () => {
    const source = read("src/app/api/admin/nutrition/route.ts");

    const start = source.indexOf(
      'if (body.action === "settle_commissions")',
    );

    expect(start).toBeGreaterThan(-1);

    const block = source.slice(start, start + 1800);

    expect(block).toContain("nutritionCommission.updateMany");
    expect(block).toContain('status: "earned"');
    expect(block).toContain('status: "settled"');
    expect(block).toContain("settledAt");
  });

  it("staff and trainer settlements only operate on earned commissions", () => {
    const staff = read("src/app/api/admin/staff-referrals/route.ts");
    const trainer = read("src/app/api/admin/trainer-referrals/route.ts");

    const staffStart = staff.indexOf('if (action === "settle")');
    const trainerStart = trainer.indexOf('if (action === "settle")');

    expect(staff.slice(staffStart, staffStart + 800)).toContain(
      'where: { staffUserId, status: "earned" }',
    );

    expect(trainer.slice(trainerStart, trainerStart + 900)).toContain(
      'where: { trainerUserId, status: "earned" }',
    );
  });
});

describe("nutrition settlement authorization", () => {
  it("allows commission settlement only for admin", () => {
    const source = read(
      "src/app/api/admin/nutrition/route.ts",
    );

    const start = source.indexOf(
      'if (body.action === "settle_commissions")',
    );

    const block = source.slice(start, start + 900);

    expect(block).toContain('role !== "admin"');
    expect(block).toContain('{ status: 403 }');
    expect(block).toContain('status: "earned"');
  });
});

describe("legacy manager settlement compatibility", () => {
  it("settles both manager-agent and manager-partner earned commissions", () => {
    const source = read("src/app/api/admin/contracts/route.ts");

    const managerSection = source.indexOf("// Update/settle manager");
    const start = source.indexOf(
      'if (body.action === "settle_commissions")',
      managerSection,
    );
    const end = source.indexOf("const upd:", start);
    const block = source.slice(start, end);

    expect(block).toContain("managerCommission.updateMany");
    expect(block).toContain("managerPartnerCommission.updateMany");

    const earnedFilters = block.match(/status:\s*"earned"/g) ?? [];
    expect(earnedFilters.length).toBeGreaterThanOrEqual(2);

    expect(block).toContain("const settledAt = new Date()");
  });
});
