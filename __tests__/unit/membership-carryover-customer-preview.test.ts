import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "@/lib/get-eligible-classes",
  () => ({
    getEligibilityPolicySnapshotForSource:
      vi.fn(),
  }),
);

vi.mock(
  "@/lib/membership-session-carryover",
  () => ({
    previewMembershipSessionCarryoverTx:
      vi.fn(),
    isBlockingMembershipCarryoverReason:
      vi.fn(),
  }),
);

import { getEligibilityPolicySnapshotForSource } from "@/lib/get-eligible-classes";
import {
  isBlockingMembershipCarryoverReason,
  previewMembershipSessionCarryoverTx,
} from "@/lib/membership-session-carryover";
import { previewMembershipCarryoverForCustomerTx } from "@/lib/membership-carryover-customer-preview";

const NOW =
  new Date("2026-09-22T12:00:00.000Z");

function previewResult(
  overrides: Record<string, unknown> = {},
) {
  return {
    eligible: true,
    reason: "eligible",
    sourceMembershipId: "source-1",
    baseSessions: 12,
    freeCarryoverSessions: 4,
    transferredReservedUnits: 0,
    carryoverSessions: 4,
    expectedTotalSessions: 16,
    transferableBookingIds: [],
    ...overrides,
  };
}

function txHarness(options?: {
  offer?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
  earliestDate?: Date | null;
}) {
  return {
    offer: {
      findUnique: vi.fn().mockResolvedValue(
        options?.offer ?? null,
      ),
    },
    membership: {
      findUnique: vi.fn().mockResolvedValue(
        options?.plan ?? {
          id: "plan-1",
          kind: "subscription",
          duration: 30,
          sessionsCount: 12,
        },
      ),
    },
    schedule: {
      findFirst: vi.fn().mockResolvedValue(
        options?.earliestDate
          ? { date: options.earliestDate }
          : null,
      ),
    },
  };
}

describe(
  "customer carryover preview target contract",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
      vi.setSystemTime(NOW);

      vi.mocked(
        getEligibilityPolicySnapshotForSource,
      ).mockResolvedValue({
        mode: "class_types",
        classTypes: ["fitness"],
      } as never);

      vi.mocked(
        previewMembershipSessionCarryoverTx,
      ).mockResolvedValue(
        previewResult() as never,
      );

      vi.mocked(
        isBlockingMembershipCarryoverReason,
      ).mockReturnValue(false);
    });

    it(
      "builds the normal membership target from server data",
      async () => {
        const tx = txHarness();

        const result =
          await previewMembershipCarryoverForCustomerTx(
            tx as never,
            "user-1",
            {
              membershipId: "plan-1",
            },
          );

        expect(
          getEligibilityPolicySnapshotForSource,
        ).toHaveBeenCalledWith(
          {
            type: "membership",
            id: "plan-1",
          },
          tx,
        );

        expect(
          previewMembershipSessionCarryoverTx,
        ).toHaveBeenCalledWith(
          tx,
          {
            userId: "user-1",
            target: expect.objectContaining({
              membershipId: "plan-1",
              offerId: null,
              baseSessions: 12,
              kind: "subscription",
              allowedClassTypesSnapshot: null,
            }),
          },
        );

        expect(result).toEqual(
          expect.objectContaining({
            eligible: true,
            carryoverSessions: 4,
            expectedTotalSessions: 16,
            blocking: false,
            targetMembershipId: "plan-1",
            targetOfferId: null,
          }),
        );
      },
    );

    it(
      "uses frozen offer entitlement overrides and allowed class types",
      async () => {
        const tx = txHarness({
          offer: {
            id: "offer-1",
            membershipId: "plan-1",
            sessionsCount: 8,
            durationDays: 20,
            type: "special",
            isActive: true,
            expiresAt:
              new Date("2026-12-31T00:00:00.000Z"),
            maxSubscribers: 100,
            currentSubscribers: 2,
            allowedClassTypes: [
              { classType: "fitness" },
              { classType: "karate" },
            ],
          },
        });

        await previewMembershipCarryoverForCustomerTx(
          tx as never,
          "user-1",
          {
            offerId: "offer-1",
            membershipId: "ignored-client-plan",
            startDate: "2026-09-25",
          },
        );

        expect(
          getEligibilityPolicySnapshotForSource,
        ).toHaveBeenCalledWith(
          {
            type: "offer",
            id: "offer-1",
          },
          tx,
        );

        expect(
          previewMembershipSessionCarryoverTx,
        ).toHaveBeenCalledWith(
          tx,
          {
            userId: "user-1",
            target: expect.objectContaining({
              membershipId: "plan-1",
              offerId: "offer-1",
              baseSessions: 8,
              allowedClassTypesSnapshot:
                JSON.stringify([
                  "fitness",
                  "karate",
                ]),
            }),
          },
        );
      },
    );

    it(
      "scales custom membership sessions exactly like checkout",
      async () => {
        const tx = txHarness({
          plan: {
            id: "custom-1",
            kind: "custom",
            duration: 360,
            sessionsCount: 24,
            minMonths: 1,
            maxMonths: 12,
          },
        });

        await previewMembershipCarryoverForCustomerTx(
          tx as never,
          "user-1",
          {
            membershipId: "custom-1",
            selectedMonths: 3,
          },
        );

        expect(
          previewMembershipSessionCarryoverTx,
        ).toHaveBeenCalledWith(
          tx,
          {
            userId: "user-1",
            target: expect.objectContaining({
              membershipId: "custom-1",
              baseSessions: 6,
            }),
          },
        );
      },
    );

    it(
      "surfaces a blocking backend decision without mutating it",
      async () => {
        vi.mocked(
          previewMembershipSessionCarryoverTx,
        ).mockResolvedValue(
          previewResult({
            eligible: false,
            reason:
              "pending_exchange_request",
            carryoverSessions: 0,
            expectedTotalSessions: 12,
          }) as never,
        );

        vi.mocked(
          isBlockingMembershipCarryoverReason,
        ).mockReturnValue(true);

        const result =
          await previewMembershipCarryoverForCustomerTx(
            txHarness() as never,
            "user-1",
            {
              membershipId: "plan-1",
            },
          );

        expect(result).toEqual(
          expect.objectContaining({
            eligible: false,
            reason:
              "pending_exchange_request",
            blocking: true,
          }),
        );
      },
    );
  },
);
