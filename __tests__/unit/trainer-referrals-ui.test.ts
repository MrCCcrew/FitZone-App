import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessAdminSection } from "@/lib/admin-permissions";

const trainersSource = readFileSync(resolve(process.cwd(), "src/app/admin/sections/Trainers.tsx"), "utf8");
const settingsSource = readFileSync(resolve(process.cwd(), "src/app/admin/sections/Settings.tsx"), "utf8");

describe("trainer referrals UI visibility", () => {
  it("does not expose the trainer-referrals tab to staff", () => {
    expect(trainersSource).toContain('const canManageTrainerReferrals = userRole === "admin" || userRole === "head_coach" || userRole === "trainer";');
    expect(trainersSource).toContain('...(canManageTrainerReferrals ? [["referrals","لينكات الإحالة"]] as const : []),');
    expect(trainersSource).not.toMatch(/userRole === "staff"[^\n]*\[\["referrals"/);
  });

  it.each(["admin", "head_coach", "trainer"])("keeps the trainer-referrals tab available to %s", (role) => {
    expect(["admin", "head_coach", "trainer"]).toContain(role);
  });

  it("keeps the staff referral administration entry available through settings", () => {
    expect(canAccessAdminSection("staff", [], "settings")).toBe(true);
    expect(canAccessAdminSection("staff", [], "trainers")).toBe(true);
    expect(settingsSource).toMatch(/<button[\s\S]*?setActiveTab\("referrals"\)[\s\S]*?لينكات إحالة الاستاف[\s\S]*?<\/button>/);
  });
});
