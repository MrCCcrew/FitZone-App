import { addCairoCalendarDays } from "@/lib/fitzone-time";

/**
 * Purchase-time terms for an independent, deferred Offer Box right.
 * This function does not activate anything or reserve class capacity.
 */
export type OfferBoxFrozenTerms = {
  membershipTemplate: {
    durationDays: number;
    sessionsCount: number | null;
  };
  eligibilitySnapshot: Record<string, unknown>;
};

export function resolveOfferBoxEntitlementTerms(
  snapshot: OfferBoxFrozenTerms,
) {
  const template = snapshot?.membershipTemplate;
  const eligibility = snapshot?.eligibilitySnapshot;

  if (
    !template ||
    !Number.isSafeInteger(template.durationDays) ||
    template.durationDays <= 0
  ) {
    throw new Error("OFFER_BOX_INVALID_FROZEN_DURATION");
  }

  if (
    template.sessionsCount !== null &&
    (
      !Number.isSafeInteger(template.sessionsCount) ||
      template.sessionsCount < 0
    )
  ) {
    throw new Error("OFFER_BOX_INVALID_FROZEN_SESSION_COUNT");
  }

  if (
    !eligibility ||
    typeof eligibility !== "object" ||
    Array.isArray(eligibility)
  ) {
    throw new Error("OFFER_BOX_INVALID_FROZEN_ELIGIBILITY");
  }

  const classTypes = Array.isArray(eligibility.classTypes)
    ? eligibility.classTypes.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    durationDays: template.durationDays,
    totalSessions: template.sessionsCount,
    eligibilitySnapshot: JSON.stringify(eligibility),
    allowedClassTypesSnapshot: classTypes.length
      ? JSON.stringify(classTypes)
      : null,
  };
}

/**
 * Prepare a deferred activation after explicit customer confirmation.
 *
 * The caller must verify ownership, confirmed payment, schedules and
 * capacity, then persist entitlement and bookings in one transaction.
 * This function itself performs no database or payment operation.
 */
export function prepareConfirmedOfferBoxActivation(
  snapshot: OfferBoxFrozenTerms,
  confirmed: boolean,
  selectedScheduleIds: string[],
  serverNow: Date,
) {
  if (confirmed !== true) {
    throw new Error("OFFER_BOX_ACTIVATION_CONFIRMATION_REQUIRED");
  }

  if (
    !(serverNow instanceof Date) ||
    !Number.isFinite(serverNow.getTime())
  ) {
    throw new Error("OFFER_BOX_INVALID_SERVER_ACTIVATION_TIME");
  }

  if (!Array.isArray(selectedScheduleIds)) {
    throw new Error("OFFER_BOX_INVALID_SELECTED_SCHEDULES");
  }

  if (
    selectedScheduleIds.length > 20 ||
    selectedScheduleIds.some(
      (id) => typeof id !== "string" || !id.trim(),
    )
  ) {
    throw new Error("OFFER_BOX_INVALID_SELECTED_SCHEDULES");
  }

  const scheduleIds = selectedScheduleIds.map((id) => id.trim());

  if (new Set(scheduleIds).size !== scheduleIds.length) {
    throw new Error("OFFER_BOX_DUPLICATE_SELECTED_SCHEDULE");
  }

  const terms = resolveOfferBoxEntitlementTerms(snapshot);
  const startDate = new Date(serverNow.getTime());
  const endDate = addCairoCalendarDays(startDate, terms.durationDays);

  if (endDate.getTime() <= startDate.getTime()) {
    throw new Error("OFFER_BOX_INVALID_ACTIVATION_PERIOD");
  }

  return {
    ...terms,
    startDate,
    endDate,
    selectedScheduleIds: scheduleIds,
  };
}
