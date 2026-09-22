import {
  describe,
  expect,
  it,
} from "vitest";

import fs from "node:fs";
import path from "node:path";

describe(
  "Membership carryover cancellation/refund guard",
  () => {
    it(
      "db-maintenance membership status edits cannot rewrite carryover provenance",
      () => {
        const file = path.join(
          process.cwd(),
          "src/app/api/admin/db-maintenance/records/route.ts",
        );

        const source =
          fs.readFileSync(file, "utf8");

        const membershipBlockStart =
          source.indexOf(
            'if (type === "memberships") {',
            source.indexOf(
              'if (action === "update-status")',
            ),
          );

        expect(
          membershipBlockStart,
        ).toBeGreaterThanOrEqual(0);

        const membershipBlockEnd =
          source.indexOf(
            'if (type === "offers")',
            membershipBlockStart,
          );

        expect(
          membershipBlockEnd,
        ).toBeGreaterThan(
          membershipBlockStart,
        );

        const statusBlock =
          source.slice(
            membershipBlockStart,
            membershipBlockEnd,
          );

        expect(statusBlock).toContain(
          "status,",
        );

        expect(statusBlock).not.toContain(
          "baseSessions",
        );

        expect(statusBlock).not.toContain(
          "carryoverSessions",
        );

        expect(statusBlock).not.toContain(
          "carryoverFromMembershipId",
        );

        expect(statusBlock).not.toContain(
          "carryoverAppliedAt",
        );

        const genericUpdateStart =
          source.indexOf(
            'if (type === "memberships") {',
            source.indexOf(
              'if (action === "update")',
            ),
          );

        expect(
          genericUpdateStart,
        ).toBeGreaterThanOrEqual(0);

        const genericUpdateEnd =
          source.indexOf(
            'return NextResponse.json',
            genericUpdateStart,
          );

        expect(
          genericUpdateEnd,
        ).toBeGreaterThan(
          genericUpdateStart,
        );

        const updateBlock =
          source.slice(
            genericUpdateStart,
            genericUpdateEnd,
          );

        expect(updateBlock).toContain(
          "status: nextMembershipStatus",
        );

        expect(updateBlock).toContain(
          "endDate:",
        );

        /*
         * Important contract:
         *
         * Cancellation/status maintenance may
         * disable the entitlement, but must not
         * erase or rewrite the accounting lineage:
         *
         * base purchased entitlement
         * +
         * carried entitlement
         * +
         * source membership provenance.
         *
         * If a real membership-refund flow is
         * introduced later, it must implement an
         * explicit policy rather than silently
         * mutating these fields here.
         */
        expect(updateBlock).not.toContain(
          "baseSessions",
        );

        expect(updateBlock).not.toContain(
          "carryoverSessions",
        );

        expect(updateBlock).not.toContain(
          "carryoverFromMembershipId",
        );

        expect(updateBlock).not.toContain(
          "carryoverAppliedAt",
        );
      },
    );

    it(
      "there is no hidden membership refund mutation in current application source",
      () => {
        const roots = [
          path.join(
            process.cwd(),
            "src/app",
          ),
          path.join(
            process.cwd(),
            "src/lib",
          ),
        ];

        const files: string[] = [];

        const walk = (
          directory: string,
        ) => {
          for (
            const entry of
            fs.readdirSync(
              directory,
              {
                withFileTypes: true,
              },
            )
          ) {
            const full =
              path.join(
                directory,
                entry.name,
              );

            if (
              entry.isDirectory()
            ) {
              walk(full);
              continue;
            }

            if (
              !entry.isFile() ||
              !/\.(ts|tsx)$/.test(
                entry.name,
              ) ||
              entry.name.includes(
                ".before-",
              )
            ) {
              continue;
            }

            files.push(full);
          }
        };

        for (
          const root of roots
        ) {
          walk(root);
        }

        const suspicious:
          Array<{
            file: string;
            line: string;
          }> = [];

        for (
          const file of files
        ) {
          const source =
            fs.readFileSync(
              file,
              "utf8",
            );

          const lines =
            source.split(/\r?\n/);

          for (
            const line of lines
          ) {
            /*
             * Detect a future UserMembership
             * refund implementation touching
             * refund semantics directly.
             *
             * Generic refund policy/UI or
             * nutrition refund code is outside
             * this contract.
             */
            if (
              /userMembership/i.test(
                line,
              ) &&
              /refund/i.test(
                line,
              )
            ) {
              suspicious.push({
                file,
                line,
              });
            }
          }
        }

        expect(
          suspicious,
        ).toEqual([]);
      },
    );
  },
);