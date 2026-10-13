import {
  evaluateEgyptianNationalIdAgeEligibility,
  type OfferAgeEligibilityResult,
} from "@/lib/offer-age-eligibility";

export function evaluateFriendOfferStudentEligibility(input: {
  requiresBirthDate: boolean;
  requiresEgyptianNationalId: boolean;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  egyptianNationalId: unknown;
  now?: Date;
}): OfferAgeEligibilityResult {
  if (!input.requiresEgyptianNationalId) {
    return {
      eligible: true,
      ageYears: null,
      code: null,
      message: null,
    };
  }

  if (
    !input.requiresBirthDate ||
    !Number.isInteger(input.minAgeYears) ||
    !Number.isInteger(input.maxAgeYears) ||
    input.minAgeYears! < 0 ||
    input.maxAgeYears! < input.minAgeYears!
  ) {
    return {
      eligible: false,
      ageYears: null,
      code: "INVALID_AGE_RULE",
      message: "إعدادات التحقق من سن عرض الطلبة غير مكتملة.",
    };
  }

  return evaluateEgyptianNationalIdAgeEligibility({
    egyptianNationalId: input.egyptianNationalId,
    minAgeYears: input.minAgeYears,
    maxAgeYears: input.maxAgeYears,
    now: input.now,
  });
}
