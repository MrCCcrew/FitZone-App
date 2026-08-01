import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("customization offers inventory", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const tools = readFileSync(resolve(process.cwd(), "src/lib/ai-coach/interactive-tools.ts"), "utf8");

  it("uses the real Membership(kind=custom) source alongside Offer", () => {
    expect(schema).toContain('kind        String  @default("subscription")');
    expect(tools).toContain('where: { kind: "custom" }');
    expect(tools).toContain('sourceType: "Offer + Membership(kind=custom)"');
    expect(tools).toContain('"available_without_expiry"');
  });

  it("does not treat a custom plan as expired because it has no end date", () => {
    expect(tools).toContain('endAt: null');
    expect(tools).toContain('status: membership.isActive ? "available_without_expiry" : "disabled"');
  });
});
