import { describe, expect, it } from "vitest";
import {
  canManageClassTypes,
} from "@/lib/admin-permissions";

describe("ClassType management permission", () => {
  it("allows only admin to mutate the global taxonomy", () => {
    expect(canManageClassTypes("admin")).toBe(true);

    expect(canManageClassTypes("staff")).toBe(false);
    expect(canManageClassTypes("trainer")).toBe(false);
    expect(canManageClassTypes("head_coach")).toBe(false);
    expect(canManageClassTypes("accountant")).toBe(false);
    expect(canManageClassTypes(undefined)).toBe(false);
  });
});
