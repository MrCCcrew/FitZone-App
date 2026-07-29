import { describe, it, expect } from "vitest";
import {
  isAdminRole,
  normalizeAdminPermissions,
  canAccessAdminFeature,
  canAccessAdminSection,
  getDefaultAdminSection,
  ADMIN_FEATURES,
  ROLE_FEATURE_TEMPLATES,
} from "@/lib/admin-permissions";

describe("isAdminRole", () => {
  it("accepts all valid admin roles", () => {
    const valid = ["admin","staff","trainer","accountant","partner","contracts_manager","agent","head_coach","nutritionist"];
    for (const role of valid) {
      expect(isAdminRole(role), `expected "${role}" to be valid`).toBe(true);
    }
  });
  it("rejects unknown strings", () => {
    expect(isAdminRole("customer")).toBe(false);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("superadmin")).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });
  it("is case-sensitive — uppercase rejected", () => {
    expect(isAdminRole("Admin")).toBe(false);
    expect(isAdminRole("ADMIN")).toBe(false);
  });
  it("rejects undefined", () => {
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("normalizeAdminPermissions", () => {
  it("admin always gets ALL features regardless of explicit permissions", () => {
    const all = normalizeAdminPermissions("admin", []);
    expect(all).toEqual(expect.arrayContaining(ADMIN_FEATURES));
    expect(all.length).toBe(ADMIN_FEATURES.length);
    const restricted = normalizeAdminPermissions("admin", ["memberships"]);
    expect(restricted.length).toBe(ADMIN_FEATURES.length);
  });
  it("explicit permission list used for non-admin roles", () => {
    const perms = normalizeAdminPermissions("staff", ["memberships", "bookings"]);
    expect(perms).toContain("memberships");
    expect(perms).toContain("bookings");
    expect(perms).not.toContain("accounting");
  });
  it("filters out invalid feature names from explicit list", () => {
    const perms = normalizeAdminPermissions("staff", ["memberships", "invalid_feature" as never, "payments" as never]);
    expect(perms).toContain("memberships");
    expect(perms).not.toContain("invalid_feature");
    expect(perms).not.toContain("payments");
  });
  it("trainer cannot receive blocked features even if explicitly listed", () => {
    const perms = normalizeAdminPermissions("trainer", ["classes","discounts","settings","accounting"]);
    expect(perms).toContain("classes");
    expect(perms).not.toContain("discounts");
    expect(perms).not.toContain("settings");
    expect(perms).not.toContain("accounting");
  });
  it("falls back to role template when no explicit permissions", () => {
    const trainer = normalizeAdminPermissions("trainer", undefined);
    expect(trainer).toContain("classes");
    expect(trainer).toContain("trainers");
    expect(trainer).not.toContain("accounting");
    expect(trainer).not.toContain("settings");
  });
  it("returns empty array for unknown role with empty permissions", () => {
    expect(normalizeAdminPermissions("hacker", [])).toEqual([]);
  });
  it("returns empty array for undefined role", () => {
    expect(normalizeAdminPermissions(undefined, [])).toEqual([]);
  });
  it("staff gets site features but not accounting", () => {
    const perms = normalizeAdminPermissions("staff", undefined);
    expect(perms).toContain("memberships");
    expect(perms).toContain("classes");
    expect(perms).toContain("referrals");
    expect(perms).not.toContain("accounting");
    expect(perms).not.toContain("settings");
  });
  it("accountant gets accounting + orders but not settings or memberships", () => {
    const perms = normalizeAdminPermissions("accountant", undefined);
    expect(perms).toContain("accounting");
    expect(perms).toContain("orders");
    expect(perms).toContain("balance");
    expect(perms).not.toContain("settings");
    expect(perms).not.toContain("memberships");
  });
  it("partner only gets partners", () => {
    expect(normalizeAdminPermissions("partner", undefined)).toEqual(["partners"]);
  });
  it("nutritionist only gets nutrition", () => {
    expect(normalizeAdminPermissions("nutritionist", undefined)).toEqual(["nutrition"]);
  });
  it("agent only gets contracts", () => {
    expect(normalizeAdminPermissions("agent", undefined)).toEqual(["contracts"]);
  });
  it("head_coach gets trainers + classes + discounts but not settings", () => {
    const perms = normalizeAdminPermissions("head_coach", undefined);
    expect(perms).toContain("trainers");
    expect(perms).toContain("classes");
    expect(perms).toContain("discounts");
    expect(perms).toContain("accounting");
    expect(perms).not.toContain("settings");
  });
  it("contracts_manager gets contracts only", () => {
    const perms = normalizeAdminPermissions("contracts_manager", undefined);
    expect(perms).toContain("contracts");
    expect(perms).not.toContain("customers");
    expect(perms).not.toContain("accounting");
  });
});

describe("canAccessAdminFeature", () => {
  it("admin can access every defined feature", () => {
    for (const feature of ADMIN_FEATURES) {
      expect(canAccessAdminFeature("admin", [], feature), `admin should access "${feature}"`).toBe(true);
    }
  });
  it("trainer cannot access discounts, settings, or accounting", () => {
    expect(canAccessAdminFeature("trainer", undefined, "discounts")).toBe(false);
    expect(canAccessAdminFeature("trainer", undefined, "settings")).toBe(false);
    expect(canAccessAdminFeature("trainer", undefined, "accounting")).toBe(false);
  });
  it("trainer can access classes, trainers, bookings, customers", () => {
    expect(canAccessAdminFeature("trainer", undefined, "classes")).toBe(true);
    expect(canAccessAdminFeature("trainer", undefined, "trainers")).toBe(true);
    expect(canAccessAdminFeature("trainer", undefined, "bookings")).toBe(true);
    expect(canAccessAdminFeature("trainer", undefined, "customers")).toBe(true);
  });
  it("explicit permissions override role template", () => {
    expect(canAccessAdminFeature("staff", ["accounting"], "accounting")).toBe(true);
    expect(canAccessAdminFeature("staff", ["accounting"], "memberships")).toBe(false);
  });
  it("requires analytics_view for staff while granting it to full admins", () => {
    expect(canAccessAdminFeature("staff", [], "analytics_view")).toBe(false);
    expect(canAccessAdminFeature("staff", ["analytics_view"], "analytics_view")).toBe(true);
    expect(canAccessAdminFeature("admin", [], "analytics_view")).toBe(true);
  });
  it("unknown role cannot access anything", () => {
    expect(canAccessAdminFeature("unknown", [], "settings")).toBe(false);
    expect(canAccessAdminFeature(undefined, [], "overview")).toBe(false);
  });
  it("partner can only access partners feature", () => {
    expect(canAccessAdminFeature("partner", undefined, "partners")).toBe(true);
    expect(canAccessAdminFeature("partner", undefined, "overview")).toBe(false);
  });
});

describe("canAccessAdminSection", () => {
  it("shows the analytics section only with analytics_view", () => {
    expect(canAccessAdminSection("staff", [], "analytics")).toBe(false);
    expect(canAccessAdminSection("staff", ["analytics_view"], "analytics")).toBe(true);
    expect(canAccessAdminSection("admin", [], "analytics")).toBe(true);
  });
  it("admin can access all major sections", () => {
    const sections = ["overview","accounting","settings","subscriptions","classes","products","orders","customers"] as const;
    for (const section of sections) {
      expect(canAccessAdminSection("admin", [], section)).toBe(true);
    }
  });
  it("staff with referrals can access settings section (special rule)", () => {
    expect(canAccessAdminSection("staff", ["referrals"], "settings")).toBe(true);
  });
  it("staff without settings or referrals cannot access settings", () => {
    expect(canAccessAdminSection("staff", ["memberships","classes"], "settings")).toBe(false);
  });
  it("partner can only access partners section", () => {
    expect(canAccessAdminSection("partner", undefined, "partners")).toBe(true);
    expect(canAccessAdminSection("partner", undefined, "overview")).toBe(false);
    expect(canAccessAdminSection("partner", undefined, "accounting")).toBe(false);
  });
  it("nutritionist can only access nutrition section", () => {
    expect(canAccessAdminSection("nutritionist", undefined, "nutrition")).toBe(true);
    expect(canAccessAdminSection("nutritionist", undefined, "overview")).toBe(false);
  });
  it("trainer cannot access payments or accounting sections", () => {
    expect(canAccessAdminSection("trainer", undefined, "payments")).toBe(false);
    expect(canAccessAdminSection("trainer", undefined, "accounting")).toBe(false);
  });
  it("trainer can access classes and bookings sections", () => {
    expect(canAccessAdminSection("trainer", undefined, "classes")).toBe(true);
    expect(canAccessAdminSection("trainer", undefined, "bookings")).toBe(true);
  });
  it("agent can only access contracts section", () => {
    expect(canAccessAdminSection("agent", undefined, "contracts")).toBe(true);
    expect(canAccessAdminSection("agent", undefined, "overview")).toBe(false);
  });
});

describe("getDefaultAdminSection", () => {
  it("admin defaults to overview", () => {
    expect(getDefaultAdminSection("admin")).toBe("overview");
  });
  it("trainer defaults to a section in their allowed list", () => {
    const section = getDefaultAdminSection("trainer");
    expect(["classes","trainers","bookings","customers"]).toContain(section);
  });
  it("contracts_manager defaults to contracts", () => {
    expect(getDefaultAdminSection("contracts_manager")).toBe("contracts");
  });
  it("agent defaults to contracts", () => {
    expect(getDefaultAdminSection("agent")).toBe("contracts");
  });
  it("head_coach defaults to trainers", () => {
    expect(getDefaultAdminSection("head_coach")).toBe("trainers");
  });
  it("staff with referrals defaults to settings", () => {
    expect(getDefaultAdminSection("staff", ["referrals"])).toBe("settings");
  });
  it("staff without special permissions does not default to settings", () => {
    const section = getDefaultAdminSection("staff", ["memberships"]);
    expect(section).not.toBe("settings");
  });
});

describe("ROLE_FEATURE_TEMPLATES integrity", () => {
  it("every feature in every role template is a valid AdminFeature", () => {
    for (const [role, features] of Object.entries(ROLE_FEATURE_TEMPLATES)) {
      for (const feature of features) {
        expect(ADMIN_FEATURES, `role "${role}" has invalid feature: "${feature}"`).toContain(feature);
      }
    }
  });
  it("admin template contains exactly all ADMIN_FEATURES", () => {
    expect(ROLE_FEATURE_TEMPLATES.admin.length).toBe(ADMIN_FEATURES.length);
    expect(ROLE_FEATURE_TEMPLATES.admin).toEqual(expect.arrayContaining(ADMIN_FEATURES));
  });
  it("no role template contains duplicate features", () => {
    for (const [role, features] of Object.entries(ROLE_FEATURE_TEMPLATES)) {
      const unique = new Set(features);
      expect(unique.size, `role "${role}" has duplicate features`).toBe(features.length);
    }
  });
});
