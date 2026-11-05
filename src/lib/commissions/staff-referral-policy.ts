import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type StaffReferralClassification =
  | "new_customer"
  | "short_term_under_minimum"
  | "short_term"
  | "long_term";

export type StaffReferralPolicyResolution = {
  classification: StaffReferralClassification;
  previousMembershipId: string | null;
  previousMembershipEndDate: Date | null;
  gapDays: number | null;

  policyId: string;
  positionId: string;
  positionCode: string;

  rateBps: number;
};

function startOfDayUtc(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

function diffCalendarDays(from: Date, to: Date): number {
  return Math.max(
    0,
    Math.floor(
      (startOfDayUtc(to) - startOfDayUtc(from)) / 86_400_000,
    ),
  );
}

/*
 * Adds whole calendar months while clamping the day to the last valid
 * day of the target month.
 *
 * Example:
 * 31 January + 3 months => 30 April
 *
 * This intentionally models the manager specification in calendar months,
 * not as a fixed number of days.
 */
function addCalendarMonthsUtc(value: Date, months: number): number {
  const sourceYear = value.getUTCFullYear();
  const sourceMonth = value.getUTCMonth();
  const sourceDay = value.getUTCDate();

  const targetFirst = new Date(
    Date.UTC(sourceYear, sourceMonth + months, 1),
  );

  const targetYear = targetFirst.getUTCFullYear();
  const targetMonth = targetFirst.getUTCMonth();

  const lastTargetDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(sourceDay, lastTargetDay),
  );
}

function assertBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`INVALID_${field}`);
  }
}

/*
 * IMPORTANT:
 *
 * This is the NEW employee-referral policy engine only.
 *
 * It MUST NOT be used by the pre-cutover legacy snapshot compatibility bridge.
 * Existing historical commission economics stay untouched.
 */
export async function resolveStaffReferralPolicyTx(
  tx: Tx,
  input: {
    customerUserId: string;
    staffUserId: string;

    /*
     * Referral classification date for the new purchase.
     * New checkout paths call this before UserMembership is created.
     */
    asOfDate: Date;

    /*
     * Optional only for callers where the current membership already exists.
     * New checkout normally leaves this null.
     */
    excludeMembershipId?: string | null;
  },
): Promise<StaffReferralPolicyResolution> {
  const employee = await tx.employeeProfile.findUnique({
    where: {
      userId: input.staffUserId,
    },
    select: {
      id: true,
      employmentStatus: true,
      positionId: true,
      position: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!employee) {
    throw new Error("STAFF_REFERRAL_EMPLOYEE_PROFILE_MISSING");
  }

  if (employee.employmentStatus !== "active") {
    throw new Error("STAFF_REFERRAL_EMPLOYEE_NOT_ACTIVE");
  }

  if (!employee.positionId || !employee.position) {
    throw new Error("STAFF_REFERRAL_POSITION_MISSING");
  }

  const policy = await tx.referralCommissionPolicy.findFirst({
    where: {
      isActive: true,
      effectiveFrom: {
        lte: input.asOfDate,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: input.asOfDate,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "desc",
    },
    include: {
      rates: {
        where: {
          positionId: employee.positionId,
        },
        take: 1,
      },
    },
  });

  if (!policy) {
    throw new Error("STAFF_REFERRAL_POLICY_MISSING");
  }

  if (
    policy.minimumShortTermGapDays < 0 ||
    !Number.isInteger(policy.shortTermMaxMonths) ||
    policy.shortTermMaxMonths < 1
  ) {
    throw new Error("STAFF_REFERRAL_POLICY_PERIOD_BOUNDS_INVALID");
  }

  assertBps(
    policy.underMinimumGapBps,
    "UNDER_MINIMUM_GAP_BPS",
  );

  assertBps(
    policy.shortTermBps,
    "SHORT_TERM_BPS",
  );

  /*
   * Read all possible historical memberships first.
   *
   * Do NOT decide "real membership" using status alone.
   * Legacy rows may pre-date activatedAt.
   */
  const memberships = await tx.userMembership.findMany({
    where: {
      userId: input.customerUserId,
      ...(input.excludeMembershipId
        ? {
            id: {
              not: input.excludeMembershipId,
            },
          }
        : {}),
    },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      activatedAt: true,
    },
    orderBy: {
      endDate: "desc",
    },
  });

  const membershipIds = memberships.map((row) => row.id);

  /*
   * Historical activation evidence.
   *
   * Mirrors the existing customer lifecycle principles:
   * - status=active
   * - activatedAt exists
   * - confirmed paid membership transaction
   * - membership attendance pass
   *
   * Unpaid/cancelled checkout attempts must never make a customer "existing".
   */
  const [paidTransactions, attendancePasses, attendedBookings] =
    membershipIds.length > 0
      ? await Promise.all([
          tx.paymentTransaction.findMany({
            where: {
              membershipId: {
                in: membershipIds,
              },
              status: "paid",
              purpose: "membership",
            },
            select: {
              membershipId: true,
            },
          }),
          tx.attendancePass.findMany({
            where: {
              userMembershipId: {
                in: membershipIds,
              },
            },
            select: {
              userMembershipId: true,
            },
          }),
          tx.booking.findMany({
            where: {
              userMembershipId: {
                in: membershipIds,
              },
              status: "attended",
            },
            select: {
              userMembershipId: true,
            },
          }),
        ])
      : [[], [], []];

  const paidMembershipIds = new Set(
    paidTransactions
      .map((row) => row.membershipId)
      .filter((id): id is string => Boolean(id)),
  );

  const attendanceMembershipIds = new Set(
    attendancePasses
      .map((row) => row.userMembershipId)
      .filter((id): id is string => Boolean(id)),
  );

  const attendedBookingMembershipIds = new Set(
    attendedBookings
      .map((row) => row.userMembershipId)
      .filter((id): id is string => Boolean(id)),
  );

  const previous = memberships.find(
    (membership) =>
      membership.status === "active" ||
      membership.activatedAt != null ||
      paidMembershipIds.has(membership.id) ||
      attendanceMembershipIds.has(membership.id) ||
      attendedBookingMembershipIds.has(membership.id),
  );

  let classification: StaffReferralClassification;
  let gapDays: number | null = null;
  let rateBps: number;

  if (!previous) {
    classification = "new_customer";

    const rate = policy.rates[0];

    if (!rate) {
      throw new Error(
        "STAFF_REFERRAL_POSITION_RATE_MISSING",
      );
    }

    assertBps(
      rate.newCustomerBps,
      "NEW_CUSTOMER_BPS",
    );

    rateBps = rate.newCustomerBps;
  } else {
    gapDays = diffCalendarDays(
      previous.endDate,
      input.asOfDate,
    );

    if (gapDays < policy.minimumShortTermGapDays) {
      classification = "short_term_under_minimum";
      rateBps = policy.underMinimumGapBps;
    } else if (
      startOfDayUtc(input.asOfDate) <=
      addCalendarMonthsUtc(
        previous.endDate,
        policy.shortTermMaxMonths,
      )
    ) {
      classification = "short_term";
      rateBps = policy.shortTermBps;
    } else {
      classification = "long_term";

      const rate = policy.rates[0];

      if (!rate) {
        throw new Error(
          "STAFF_REFERRAL_POSITION_RATE_MISSING",
        );
      }

      assertBps(
        rate.longTermBps,
        "LONG_TERM_BPS",
      );

      rateBps = rate.longTermBps;
    }
  }

  return {
    classification,

    previousMembershipId:
      previous?.id ?? null,

    previousMembershipEndDate:
      previous?.endDate ?? null,

    gapDays,

    policyId: policy.id,

    positionId: employee.position.id,
    positionCode: employee.position.code,

    rateBps,
  };
}
