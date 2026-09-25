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
  "paid booking base-session contract",
  () => {
    it(
      "never uses carryover-expanded totalSessions as the legacy booking-plan target",
      () => {
        const source = readFileSync(
          join(
            process.cwd(),
            "src/lib/payments/service.ts",
          ),
          "utf8",
        );

        const helperStart =
          source.indexOf(
            "async function ensureMembershipBookingsFromPaymentMetadataTx(",
          );

        expect(
          helperStart,
        ).toBeGreaterThanOrEqual(0);

        const helperEnd =
          source.indexOf(
            "/**\n * Shared activation helper",
            helperStart,
          );

        expect(
          helperEnd,
        ).toBeGreaterThan(
          helperStart,
        );

        const helper =
          source.slice(
            helperStart,
            helperEnd,
          );

        expect(helper).toContain(
          "baseSessions: true",
        );

        expect(helper).toContain(
          [
            "const sessionsCount =",
            "    membership.baseSessions ??",
            "    membership.totalSessions ??",
            "    membership.membership.sessionsCount ??",
            "    null;",
          ].join("\n"),
        );

        const basePosition =
          helper.indexOf(
            "membership.baseSessions ??",
          );

        const totalPosition =
          helper.indexOf(
            "membership.totalSessions ??",
          );

        expect(
          basePosition,
        ).toBeGreaterThanOrEqual(0);

        expect(
          totalPosition,
        ).toBeGreaterThan(
          basePosition,
        );
      },
    );
  },
);
