import {
  evaluateFriendOfferStudentEligibility,
} from "@/lib/friend-offer-student-eligibility";

export type FriendOfferAccountCheckoutInput = {
  token: string;
  returnUrl: string;
  cancelUrl: string;
  requiresBirthDate: boolean;
  requiresEgyptianNationalId: boolean;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  egyptianNationalId?: string;
  now?: Date;
};

export function buildFriendOfferAccountCheckoutPayload(
  input: FriendOfferAccountCheckoutInput,
) {
  const payload: {
    token: string;
    returnUrl: string;
    cancelUrl: string;
    egyptianNationalId?: string;
  } = {
    token: input.token,
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
  };

  if (input.requiresEgyptianNationalId) {
    const result = evaluateFriendOfferStudentEligibility({
      requiresBirthDate: input.requiresBirthDate,
      requiresEgyptianNationalId: true,
      minAgeYears: input.minAgeYears,
      maxAgeYears: input.maxAgeYears,
      egyptianNationalId: input.egyptianNationalId,
      now: input.now,
    });

    if (!result.eligible) {
      throw new Error(
        result.message || "تعذر التحقق من أهلية عرض الطلبة.",
      );
    }

    payload.egyptianNationalId = input.egyptianNationalId?.trim();
  }

  return payload;
}
