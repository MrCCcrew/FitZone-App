import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type ReferralPolicyRateInput = {
  positionId: string;
  newCustomerBps: number;
  longTermBps: number;
};

export type SaveReferralPolicyInput = {
  effectiveFrom: Date;
  minimumShortTermGapDays: number;
  shortTermMaxMonths: number;
  underMinimumGapBps: number;
  shortTermBps: number;
  notes?: string | null;
  createdById?: string | null;
  rates: ReferralPolicyRateInput[];
};

function startOfDayUtc(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function previousDay(value: Date): Date {
  const result = new Date(startOfDayUtc(value));
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

function assertInteger(value: number, code: string, min: number, max?: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    (max != null && value > max)
  ) {
    throw new Error(code);
  }
}

export async function saveReferralCommissionPolicyTx(
  tx: Tx,
  input: SaveReferralPolicyInput,
) {
  const effectiveFrom = startOfDayUtc(input.effectiveFrom);

  if (Number.isNaN(effectiveFrom.getTime())) {
    throw new Error("REFERRAL_POLICY_INVALID_EFFECTIVE_FROM");
  }

  assertInteger(
    input.minimumShortTermGapDays,
    "REFERRAL_POLICY_INVALID_MINIMUM_GAP",
    0,
  );

  assertInteger(
    input.shortTermMaxMonths,
    "REFERRAL_POLICY_INVALID_SHORT_TERM_MONTHS",
    1,
  );

  assertInteger(
    input.underMinimumGapBps,
    "REFERRAL_POLICY_INVALID_UNDER_MINIMUM_BPS",
    0,
    10_000,
  );

  assertInteger(
    input.shortTermBps,
    "REFERRAL_POLICY_INVALID_SHORT_TERM_BPS",
    0,
    10_000,
  );

  if (!Array.isArray(input.rates) || input.rates.length === 0) {
    throw new Error("REFERRAL_POLICY_RATES_REQUIRED");
  }

  const seen = new Set<string>();

  for (const rate of input.rates) {
    if (!rate.positionId?.trim()) {
      throw new Error("REFERRAL_POLICY_POSITION_REQUIRED");
    }

    if (seen.has(rate.positionId)) {
      throw new Error("REFERRAL_POLICY_DUPLICATE_POSITION");
    }

    seen.add(rate.positionId);

    assertInteger(
      rate.newCustomerBps,
      "REFERRAL_POLICY_INVALID_NEW_CUSTOMER_BPS",
      0,
      10_000,
    );

    assertInteger(
      rate.longTermBps,
      "REFERRAL_POLICY_INVALID_LONG_TERM_BPS",
      0,
      10_000,
    );
  }

  const positions = await tx.position.findMany({
    where: {
      id: {
        in: input.rates.map((rate) => rate.positionId),
      },
    },
    select: {
      id: true,
    },
  });

  if (positions.length !== input.rates.length) {
    throw new Error("REFERRAL_POLICY_POSITION_NOT_FOUND");
  }

  const duplicate = await tx.referralCommissionPolicy.findUnique({
    where: {
      effectiveFrom,
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error("REFERRAL_POLICY_EFFECTIVE_FROM_EXISTS");
  }

  const previous = await tx.referralCommissionPolicy.findFirst({
    where: {
      effectiveFrom: {
        lt: effectiveFrom,
      },
    },
    orderBy: {
      effectiveFrom: "desc",
    },
    select: {
      id: true,
      effectiveTo: true,
    },
  });

  const next = await tx.referralCommissionPolicy.findFirst({
    where: {
      effectiveFrom: {
        gt: effectiveFrom,
      },
    },
    orderBy: {
      effectiveFrom: "asc",
    },
    select: {
      id: true,
      effectiveFrom: true,
    },
  });

  if (previous) {
    const requiredEnd = previousDay(effectiveFrom);

    if (
      previous.effectiveTo == null ||
      previous.effectiveTo.getTime() >= effectiveFrom.getTime()
    ) {
      await tx.referralCommissionPolicy.update({
        where: {
          id: previous.id,
        },
        data: {
          effectiveTo: requiredEnd,
        },
      });
    }
  }

  const effectiveTo = next ? previousDay(next.effectiveFrom) : null;

  return tx.referralCommissionPolicy.create({
    data: {
      effectiveFrom,
      effectiveTo,

      minimumShortTermGapDays: input.minimumShortTermGapDays,

      shortTermMaxMonths: input.shortTermMaxMonths,

      underMinimumGapBps: input.underMinimumGapBps,

      shortTermBps: input.shortTermBps,

      notes: input.notes?.trim() || null,

      createdById: input.createdById?.trim() || null,

      isActive: true,

      rates: {
        create: input.rates.map((rate) => ({
          positionId: rate.positionId,
          newCustomerBps: rate.newCustomerBps,
          longTermBps: rate.longTermBps,
        })),
      },
    },
    include: {
      rates: {
        include: {
          position: true,
        },
      },
    },
  });
}
