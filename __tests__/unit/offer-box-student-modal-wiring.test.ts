import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/app/FitzoneApp.tsx"),
  "utf8",
);

const start = source.indexOf("function useOfferBoxCheckout(");
const end = source.indexOf("const HomePage =", start);
const hook = source.slice(start, end);

describe("Offer Box student modal wiring regression", () => {
  it("mounts the age dialog in both Home and Offers pages", () => {
    expect(
      source.match(/useOfferBoxCheckout\(summary\);/g),
    ).toHaveLength(2);

    expect(source).toContain(
      "offerBoxAgeDialogId === offer.id && offerBoxAgeDialog",
    );

    expect(source).toContain(
      "offerBoxAgeDialogId === o.id && offerBoxAgeDialog",
    );
  });

  it("renders an accessible modal with readable national ID input", () => {
    expect(source).toContain(
      "FITZONE_OFFER_BOX_STUDENT_MODAL_V2",
    );
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('color: "#111827"');
    expect(source).toContain("createStudentOfferPortal(");
  });

  it("checks existing payment status before verifying a new checkout", () => {
    const steps = [
      'const previous = await getOfferBoxPending(offer.id)',
      'if (previous.status === "payable")',
      'if (previous.status === "awaiting_confirmation")',
      'if (previous.status !== "none")',
      "await requestStudentAge(offer)",
      'fetch("/api/offer-box/checkout"',
    ];

    const positions = steps.map((step) => hook.indexOf(step));

    expect(positions.every((position) => position >= 0)).toBe(true);

    expect(positions).toEqual(
      [...positions].sort((a, b) => a - b),
    );
  });

  it("requires age verification only for flagged student offers", () => {
    expect(hook).toMatch(
      /if \(offer\.requiresEgyptianNationalId\) \{\s*const verifiedId = await requestStudentAge\(offer\)/,
    );

    expect(hook).toContain(
      "if (verifiedId === null) return;",
    );

    expect(hook).not.toContain("window.prompt(");
  });

  it("keeps server validation and cancellation before checkout", () => {
    expect(source).toContain(
      'fetch("/api/offers/student-age-check"',
    );

    expect(source).toContain(
      "if (!response.ok || result?.eligible !== true)",
    );

    expect(source).toContain(
      "onResolve(null)",
    );

    expect(hook).toContain(
      "egyptianNationalId = verifiedId;",
    );
  });
});
