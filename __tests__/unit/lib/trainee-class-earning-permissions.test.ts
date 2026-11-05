import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSION_KEYS,
  canAccessAdminSection,
} from "@/lib/admin-permissions";

import { hasAdminPermission } from "@/lib/admin-authorization";

describe("Trainee Class Earning permissions", () => {
  const view = "trainee_class_earning_view" as const;

  const calculate = "trainee_class_earning_calculate" as const;

  const finalize = "trainee_class_earning_finalize" as const;

  it("registers all three permission keys", () => {
    expect(ADMIN_PERMISSION_KEYS).toContain(view);

    expect(ADMIN_PERMISSION_KEYS).toContain(calculate);

    expect(ADMIN_PERMISSION_KEYS).toContain(finalize);
  });

  it("view permission opens employees section", () => {
    expect(canAccessAdminSection("staff", [view], "employees")).toBe(true);
  });

  it("calculate permission opens employees section", () => {
    expect(canAccessAdminSection("staff", [calculate], "employees")).toBe(true);
  });

  it("finalize permission opens employees section", () => {
    expect(canAccessAdminSection("staff", [finalize], "employees")).toBe(true);
  });

  it("permissions remain independent", () => {
    const user = {
      role: "staff",
      permissions: [calculate],
    };

    expect(hasAdminPermission(user, calculate)).toBe(true);

    expect(hasAdminPermission(user, view)).toBe(false);

    expect(hasAdminPermission(user, finalize)).toBe(false);
  });

  it("view does not imply calculate or finalize", () => {
    const user = {
      role: "staff",
      permissions: [view],
    };

    expect(hasAdminPermission(user, view)).toBe(true);

    expect(hasAdminPermission(user, calculate)).toBe(false);

    expect(hasAdminPermission(user, finalize)).toBe(false);
  });

  it("finalize does not imply calculate or view", () => {
    const user = {
      role: "staff",
      permissions: [finalize],
    };

    expect(hasAdminPermission(user, finalize)).toBe(true);

    expect(hasAdminPermission(user, calculate)).toBe(false);

    expect(hasAdminPermission(user, view)).toBe(false);
  });

  it("admin has all trainee earning permissions", () => {
    const admin = {
      role: "admin",
      permissions: [],
    };

    expect(hasAdminPermission(admin, view)).toBe(true);

    expect(hasAdminPermission(admin, calculate)).toBe(true);

    expect(hasAdminPermission(admin, finalize)).toBe(true);
  });

  it("staff without explicit permission has none", () => {
    const staff = {
      role: "staff",
      permissions: [],
    };

    expect(hasAdminPermission(staff, view)).toBe(false);

    expect(hasAdminPermission(staff, calculate)).toBe(false);

    expect(hasAdminPermission(staff, finalize)).toBe(false);
  });
});
