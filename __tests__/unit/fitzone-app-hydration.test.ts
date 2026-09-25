import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/FitzoneApp.tsx"), "utf8");

describe("FitzoneApp hydration structure", () => {
  it("keeps one static AI Coach accessibility announcer before page content", () => {
    expect((source.match(/aria-live="polite"/g) ?? [])).toHaveLength(1);
    expect(source).toContain('className="sr-only" aria-live="polite" aria-atomic="true"');
    const announcer = source.indexOf("<CoachAccessibilityAnnouncer announcement={coachAnnouncement} />");
    const membershipWrapper = source.indexOf("<MembershipsPage");
    expect(announcer).toBeGreaterThan(-1);
    expect(announcer).toBeLessThan(membershipWrapper);
  });

  it("does not read session storage while rendering MembershipsPage", () => {
    expect(source).toContain("const [hasPendingFlow, setHasPendingFlow] = useState(false);");
    expect(source).not.toContain('const hasPendingFlow = typeof window !== "undefined"');
  });

  it("keeps the main child order independent of UI action runtime state", () => {
    const domainMarker = source.indexOf("data-ai-coach-domain");
    const mainStart = source.lastIndexOf("<main", domainMarker);
    const mainEnd = source.indexOf("</main>", domainMarker);

    expect(domainMarker).toBeGreaterThan(-1);
    expect(mainStart).toBeGreaterThan(-1);
    expect(mainEnd).toBeGreaterThan(mainStart);

    const main = source.slice(mainStart, mainEnd);
    expect(main).toMatch(/<CoachAccessibilityAnnouncer[\s\S]*?<MembershipsPage[\s\S]*?\{page !== "memberships"/);
    expect(main).not.toContain("typeof window");
    expect(main).not.toContain("matchMedia");
  });
});
