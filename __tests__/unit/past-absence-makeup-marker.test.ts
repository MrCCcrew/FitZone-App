import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { isBookingOperational } from "@/lib/booking-operational";

describe("past absence make-up protection", () => {
  it("marks the authoritative historical-absence replacement as a real make-up", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/booking-reschedule-service.ts",
      ),
      "utf8",
    );

    const start = source.indexOf(
      "const makeupBooking =",
    );

    const end = source.indexOf(
      "makeupBookingId = makeupBooking.id",
      start,
    );

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("isMakeup: true");
    expect(block).toContain(
      '"past_absence_makeup"',
    );
    expect(block).toContain("paidAmount: 0");
  });

  it("keeps only an expired make-up booking operational", () => {
    expect(
      isBookingOperational({
        status: "confirmed",
        isMakeup: true,
        userMembership: {
          status: "expired",
        },
      }),
    ).toBe(true);
  });

  it("does not reactivate ordinary expired membership bookings", () => {
    expect(
      isBookingOperational({
        status: "confirmed",
        isMakeup: false,
        userMembership: {
          status: "expired",
        },
      }),
    ).toBe(false);
  });
});
