import "server-only";

import type { Prisma } from "@prisma/client";
import {
  addCairoCalendarDays,
  cairoCalendarDateKey,
  cairoDateStartInstant,
} from "@/lib/fitzone-time";
import { getEligibilityPolicySnapshotForSource } from "@/lib/get-eligible-classes";
import {
  isBlockingMembershipCarryoverReason,
  previewMembershipSessionCarryoverTx,
  type MembershipCarryoverPreview,
} from "@/lib/membership-session-carryover";

export type MembershipCarryoverCustomerPreviewInput = {
  membershipId?: string | null;
  offerId?: string | null;
  scheduleIds?: string[] | null;
  selectedMonths?: number | null;
  startDate?: string | null;
};

export type MembershipCarryoverCustomerPreview = Pick<
  MembershipCarryoverPreview,
  | "eligible"
  | "reason"
  | "baseSessions"
  | "freeCarryoverSessions"
  | "transferredReservedUnits"
  | "carryoverSessions"
  | "expectedTotalSessions"
> & {
  blocking: boolean;
  targetMembershipId: string;
  targetOfferId: string | null;
};

function normalizeIds(values: string[] | null | undefined) {
  return [
    ...new Set(
      (values ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Builds the same immutable carryover target contract used by subscription
 * checkout, but performs no write.
 *
 * This helper intentionally does not create synthetic memberships for a brand
 * new standalone offer. Such an offer cannot have an existing compatible
 * source membership yet; once the first purchase creates/binds its membership,
 * future renewals can be previewed normally.
 */
export async function previewMembershipCarryoverForCustomerTx(
  tx: Prisma.TransactionClient,
  userId: string,
  input: MembershipCarryoverCustomerPreviewInput,
): Promise<MembershipCarryoverCustomerPreview | null> {
  const requestedMembershipId = String(input.membershipId ?? "").trim() || null;
  const requestedOfferId = String(input.offerId ?? "").trim() || null;

  if (!requestedMembershipId && !requestedOfferId) {
    return null;
  }

  let resolvedMembershipId = requestedMembershipId;
  let offerRecord:
    | {
        id: string;
        membershipId: string | null;
        sessionsCount: number | null;
        durationDays: number | null;
        type: string;
        isActive: boolean;
        expiresAt: Date;
        maxSubscribers: number | null;
        currentSubscribers: number;
        allowedClassTypes: Array<{ classType: string }>;
      }
    | null = null;

  if (requestedOfferId) {
    const offer = await tx.offer.findUnique({
      where: { id: requestedOfferId },
      select: {
        id: true,
        membershipId: true,
        sessionsCount: true,
        durationDays: true,
        type: true,
        isActive: true,
        expiresAt: true,
        maxSubscribers: true,
        currentSubscribers: true,
        allowedClassTypes: {
          select: { classType: true },
        },
      },
    });

    if (
      !offer ||
      offer.isActive !== true ||
      offer.expiresAt <= new Date() ||
      offer.type !== "special" ||
      (offer.maxSubscribers != null &&
        offer.maxSubscribers > 0 &&
        offer.currentSubscribers >= offer.maxSubscribers)
    ) {
      return null;
    }

    offerRecord = offer;
    resolvedMembershipId = offer.membershipId ?? resolvedMembershipId;
  }

  if (!resolvedMembershipId) {
    return null;
  }

  const plan = await tx.membership.findUnique({
    where: { id: resolvedMembershipId },
  });

  if (!plan) {
    return null;
  }

  let planDurationDays = plan.duration;
  let planSessionsCount = plan.sessionsCount as number | null;

  if (plan.kind === "custom") {
    const minMonths = (plan as any).minMonths as number | null;
    const maxMonths = (plan as any).maxMonths as number | null;
    const months = Math.floor(Number(input.selectedMonths ?? 0));

    if (
      !months ||
      (minMonths != null && months < minMonths) ||
      (maxMonths != null && months > maxMonths)
    ) {
      return null;
    }

    planDurationDays = months * 30;

    if (planSessionsCount && maxMonths) {
      planSessionsCount = Math.round(
        (planSessionsCount / maxMonths) * months,
      );
    }
  }

  const effectiveDurationDays =
    offerRecord?.durationDays ?? planDurationDays;

  const effectiveSessionsCount =
    offerRecord?.sessionsCount ?? planSessionsCount ?? null;

  const selectedScheduleIds = normalizeIds(input.scheduleIds);

  const earliestSelectedSchedule =
    selectedScheduleIds.length > 0
      ? await tx.schedule.findFirst({
          where: { id: { in: selectedScheduleIds } },
          orderBy: { date: "asc" },
          select: { date: true },
        })
      : null;

  const resolvedStart = (() => {
    const requestedStartDate = String(input.startDate ?? "").trim();

    if (requestedStartDate) {
      try {
        const parsed = cairoDateStartInstant(requestedStartDate);
        const today = cairoDateStartInstant(
          cairoCalendarDateKey(new Date()),
        );
        const maxStart = addCairoCalendarDays(today, 60);

        if (parsed >= today && parsed <= maxStart) {
          return parsed;
        }
      } catch {
        // Match subscribe behaviour: invalid client date falls back below.
      }
    }

    if (earliestSelectedSchedule?.date) {
      return cairoDateStartInstant(
        cairoCalendarDateKey(
          new Date(earliestSelectedSchedule.date),
        ),
      );
    }

    return new Date();
  })();

  const endDate = addCairoCalendarDays(
    resolvedStart,
    effectiveDurationDays,
  );

  const eligibilitySource = offerRecord
    ? {
        type: "offer" as const,
        id: offerRecord.id,
      }
    : plan.kind === "trial"
      ? {
          type: "trial" as const,
          id: plan.id,
        }
      : {
          type:
            plan.kind === "package"
              ? ("package" as const)
              : ("membership" as const),
          id: plan.id,
        };

  const eligibilitySnapshot = JSON.stringify(
    await getEligibilityPolicySnapshotForSource(
      eligibilitySource,
      tx,
    ),
  );

  const allowedClassTypesSnapshot = offerRecord
    ? JSON.stringify(
        offerRecord.allowedClassTypes.map(
          (item) => item.classType,
        ),
      )
    : null;

  const preview =
    await previewMembershipSessionCarryoverTx(
      tx,
      {
        userId,
        target: {
          membershipId: plan.id,
          offerId: offerRecord?.id ?? null,
          eligibilitySnapshot,
          allowedClassTypesSnapshot,
          baseSessions: effectiveSessionsCount,
          startDate: resolvedStart,
          endDate,
          kind: plan.kind,
        },
      },
    );

  return {
    eligible: preview.eligible,
    reason: preview.reason,
    baseSessions: preview.baseSessions,
    freeCarryoverSessions:
      preview.freeCarryoverSessions,
    transferredReservedUnits:
      preview.transferredReservedUnits,
    carryoverSessions:
      preview.carryoverSessions,
    expectedTotalSessions:
      preview.expectedTotalSessions,
    blocking:
      isBlockingMembershipCarryoverReason(
        preview.reason,
      ),
    targetMembershipId: plan.id,
    targetOfferId: offerRecord?.id ?? null,
  };
}
