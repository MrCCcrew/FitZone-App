import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "timeout booking recovery partial idempotency",
  () => {
    it(
      "keeps per-schedule duplicate protection without globally skipping restoration",
      () => {
        const source = readFileSync(
          join(
            process.cwd(),
            "src/lib/payments/service.ts",
          ),
          "utf8",
        );

        const start = source.indexOf(
          "async function restoreBookingsFromMetadata(",
        );

        const end = source.indexOf(
          "/**\n * Recovery function for payments already marked",
          start,
        );

        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);

        const helper = source.slice(
          start,
          end,
        );

        expect(helper).not.toContain(
          "existingBookingsCount",
        );

        expect(helper).not.toContain(
          "already has ${existingBookingsCount} bookings - skip restoration",
        );

        expect(helper).toContain(
          "await tx.$queryRaw`",
        );

        expect(helper).toContain(
          "const existing = await tx.booking.findFirst({",
        );

        expect(helper).toContain(
          "scheduleId: schedule.id,",
        );

        expect(helper).toContain(
          "userMembershipId,",
        );

        expect(helper).toContain(
          "if (existing) {",
        );

        expect(helper).toContain(
          "Booking already exists for schedule",
        );
      },
    );
  },
);
