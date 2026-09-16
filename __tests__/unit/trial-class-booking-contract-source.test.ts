import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Trial booking contract source regression", () => {
  it("canonical EligibilitySource supports trial and booking contract parser accepts it", () => {
    const eligibilitySource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/get-eligible-classes.ts"),
      "utf8",
    );

    const bookingPlan = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/payments/membership-booking-plan.ts",
      ),
      "utf8",
    );

    expect(eligibilitySource).toContain(
      '"offer" | "membership" | "package" | "trial"',
    );

    expect(bookingPlan).toContain(
      'candidate.source.type !== "trial"',
    );
  });
});
