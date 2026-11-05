import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

function read(relative: string) {
  return fs.readFileSync(
    path.join(process.cwd(), relative),
    "utf8",
  );
}

describe(
  "Payroll Settings admin UI wiring",
  () => {
    const employeesHr = read(
      "src/app/admin/sections/EmployeesHR.tsx",
    );

    const settingsUi = read(
      "src/app/admin/sections/PayrollSettingsTab.tsx",
    );

    const api = read(
      "src/app/api/admin/payroll-settings/route.ts",
    );

    it(
      "imports and renders PayrollSettingsTab",
      () => {
        expect(employeesHr).toContain(
          'import PayrollSettingsTab from "./PayrollSettingsTab"',
        );

        expect(employeesHr).toContain(
          'activeTab === "payroll-settings"',
        );

        expect(employeesHr).toContain(
          "<PayrollSettingsTab",
        );
      },
    );

    it(
      "uses compensation permissions for settings access",
      () => {
        expect(employeesHr).toContain(
          "const canAccessPayrollSettingsTab",
        );

        expect(employeesHr).toContain(
          "canViewCompensation || canManageCompensation",
        );

        expect(employeesHr).toContain(
          "canManage={canManageCompensation}",
        );
      },
    );

    it(
      "shows Arabic Payroll Settings tab",
      () => {
        expect(employeesHr).toContain(
          "⚙️ إعدادات الرواتب",
        );

        expect(settingsUi).toContain(
          "إعدادات الرواتب حسب المسمى الوظيفي",
        );
      },
    );

    it(
      "exposes all position payroll policy fields",
      () => {
        for (const field of [
          "fixedSalaryMinor",
          "defaultFixedClassMonthlyMinor",
          "traineeClassCommissionBps",
          "privateSessionCommissionBps",
          "coachMembershipCommissionBps",
          "headCoachMonthlyBaseMinutes",
          "headCoachWeeklyMinMinutes",
          "headCoachWeeklyCapMinutes",
        ]) {
          expect(settingsUi).toContain(field);
          expect(api).toContain(field);
        }
      },
    );

    it(
      "does not expose Head Coach hours for non-head position",
      () => {
        expect(settingsUi).toContain(
          'selectedPosition?.code ===',
        );

        expect(settingsUi).toContain(
          '"HEAD_COACH_OWNER"',
        );

        expect(settingsUi).toContain(
          "{isHeadCoach && (",
        );
      },
    );

    it(
      "creates effective-dated policies rather than editing historical records",
      () => {
        expect(api).toContain(
          "savePositionPayrollPolicyTx",
        );

        expect(api).toContain(
          "export async function POST",
        );

        expect(api).not.toContain(
          "export async function PATCH",
        );

        expect(settingsUi).toContain(
          "حفظ سياسة جديدة",
        );

        expect(settingsUi).toContain(
          "لم يتم تعديل أي سياسة تاريخية",
        );
      },
    );

    it(
      "protects read and manage operations separately",
      () => {
        expect(api).toContain(
          '"employee_compensation_view"',
        );

        expect(api).toContain(
          '"employee_compensation_manage"',
        );
      },
    );
  },
);
