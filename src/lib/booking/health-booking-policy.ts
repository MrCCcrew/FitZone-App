export type HealthRestrictionInput = {
  classType: string | null | undefined;
  yesResponses: Array<{
    question: {
      isActive: boolean;
      restrictions: Array<{ classType: string }>;
    };
  }>;
};

const normalizeType = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

export function isClassBlockedByHealthRestrictions({
  classType,
  yesResponses,
}: HealthRestrictionInput): boolean {
  const targetType = normalizeType(classType);
  if (!targetType) return false;

  return yesResponses.some((response) => {
    if (!response.question.isActive) return false;
    return response.question.restrictions.some(
      (restriction) => normalizeType(restriction.classType) === targetType,
    );
  });
}

export async function assertUserCanBookClassByHealth(
  dbx: any,
  userId: string,
  classType: string | null | undefined,
) {
  const targetType = normalizeType(classType);
  if (!targetType) return;

  const yesResponses = await dbx.healthResponse.findMany({
    where: { userId, answer: true },
    include: {
      question: {
        select: {
          isActive: true,
          restrictions: { select: { classType: true } },
        },
      },
    },
  });

  if (
    isClassBlockedByHealthRestrictions({
      classType: targetType,
      yesResponses,
    })
  ) {
    const error = new Error("HEALTH_RESTRICTION_BLOCKED");
    error.name = "HealthRestrictionError";
    throw error;
  }
}
