import {
  getEligibilityPolicySnapshotForSource,
  isClassAllowedByEligibilitySnapshot,
  parseEligibilityPolicySnapshot,
  type EligibilityPolicySnapshot,
  type EligibilitySource,
} from "@/lib/get-eligible-classes";
import { resolveBookingPolicy } from "@/lib/booking/booking-policy";
import { sumMembershipBookingUnits } from "@/lib/membership-session-units";
import { assertUserCanBookClassByHealth } from "@/lib/booking/health-booking-policy";
import {
  cairoCalendarDateKey,
  scheduleSlotInstant,
  scheduleWeekday,
} from "@/lib/fitzone-time";

export type MembershipBookingAction = "back_to_schedule" | "back_to_plan";

export class MembershipBookingPlanError extends Error {
  action?: MembershipBookingAction;

  constructor(message: string, action?: MembershipBookingAction) {
    super(message);
    this.name = "MembershipBookingPlanError";
    this.action = action;
  }
}

type BookingPlanInput = {
  tx: any;
  userId: string;
  userMembershipId: string;
  startDate: Date;
  endDate: Date;
  selectedScheduleIds: string[];
  source: EligibilitySource;
  plan: {
    kind: string;
    sessionsCount: number | null;
    duration: number;
  };
};

type BookingPattern = {
  classId: string;
  time: string;
  dayOfWeek: number;
};

type BookingPolicy = {
  durationDays: number;
  totalSessions: number | null;
  minSessionsPerWeek: number | null;
  selectedSessionsPerWeek: number;
  selectedDaysPerWeek: number;
  maxSessionsPerDay: number;
  requireDistinctClassesPerDay?: boolean;
};

type BookingContract = {
  version: 1;
  timezone: "Africa/Cairo";
  source: EligibilitySource;
  eligibility: EligibilityPolicySnapshot;
  seedScheduleIds: string[];
  patterns: BookingPattern[];
  policy: BookingPolicy;
};

const parseBookingContract = (
  value: string | null | undefined,
  userMembershipId: string,
  fallbackSeedScheduleIds: string[] = [],
): BookingContract | null => {
  if (!value) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `Invalid bookingPatternSnapshot JSON for membership ${userMembershipId}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      `Invalid bookingPatternSnapshot for membership ${userMembershipId}`,
    );
  }

  const candidate = parsed as Partial<BookingContract>;

  if (
    candidate.version !== 1 ||
    candidate.timezone !== "Africa/Cairo" ||
    !candidate.source ||
    !candidate.eligibility ||
    !Array.isArray(candidate.patterns) ||
    !candidate.policy
  ) {
    throw new Error(
      `Unsupported bookingPatternSnapshot for membership ${userMembershipId}`,
    );
  }

  if (
    candidate.source.type !== "offer" &&
    candidate.source.type !== "membership" &&
    candidate.source.type !== "package" &&
    candidate.source.type !== "trial"
  ) {
    throw new Error(
      `Invalid booking source snapshot for membership ${userMembershipId}`,
    );
  }

  if (
    candidate.eligibility.mode !== "class_ids" &&
    candidate.eligibility.mode !== "class_type_ids" &&
    candidate.eligibility.mode !== "class_types" &&
    candidate.eligibility.mode !== "mixed"
  ) {
    throw new Error(
      `Invalid eligibility snapshot for membership ${userMembershipId}`,
    );
  }

  const validPatterns = candidate.patterns.every(
    (pattern) =>
      pattern &&
      typeof pattern.classId === "string" &&
      pattern.classId.length > 0 &&
      typeof pattern.time === "string" &&
      Number.isInteger(pattern.dayOfWeek) &&
      pattern.dayOfWeek >= 0 &&
      pattern.dayOfWeek <= 6,
  );

  if (!validPatterns || candidate.patterns.length === 0) {
    throw new Error(
      `Invalid booking patterns for membership ${userMembershipId}`,
    );
  }

  const policy = candidate.policy;

  if (
    !Number.isFinite(policy.durationDays) ||
    policy.durationDays <= 0 ||
    !Number.isFinite(policy.selectedSessionsPerWeek) ||
    policy.selectedSessionsPerWeek <= 0 ||
    !Number.isFinite(policy.selectedDaysPerWeek) ||
    policy.selectedDaysPerWeek <= 0 ||
    !Number.isInteger(policy.maxSessionsPerDay) ||
    policy.maxSessionsPerDay <= 0 ||
    policy.maxSessionsPerDay > 12
  ) {
    throw new Error(
      `Invalid booking policy for membership ${userMembershipId}`,
    );
  }

  return {
    version: 1,
    timezone: "Africa/Cairo",
    source: candidate.source,
    eligibility: candidate.eligibility,
    seedScheduleIds: Array.isArray(candidate.seedScheduleIds)
      ? [
          ...new Set(
            candidate.seedScheduleIds.filter(
              (id): id is string =>
                typeof id === "string" && id.length > 0,
            ),
          ),
        ]
      : [...fallbackSeedScheduleIds],
    patterns: candidate.patterns,
    policy,
  };
};

const patternKey = (
  classId: string,
  time: string,
  dayOfWeek: number,
) => `${classId}|${time}|${dayOfWeek}`;

export async function applyMembershipBookingPlanTx({
  tx,
  userId,
  userMembershipId,
  startDate,
  endDate,
  selectedScheduleIds: rawSelectedScheduleIds,
  source,
  plan,
}: BookingPlanInput) {
  const selectedScheduleIds = [
    ...new Set(
      rawSelectedScheduleIds.filter(
        (id) => typeof id === "string" && id.trim() !== "",
      ),
    ),
  ];

  /*
   * CONTRACT-FIRST FLOW
   *
   * Once bookingPatternSnapshot exists, retries/recovery must apply that
   * immutable contract and must not depend on newly supplied seed IDs or
   * mutable plan terms.
   */
  const preexistingContractRecord =
    await tx.userMembership.findUnique({
      where: { id: userMembershipId },
      select: { bookingPatternSnapshot: true, eligibilitySnapshot: true },
    });

  const hasFrozenBookingContract =
    Boolean(preexistingContractRecord?.bookingPatternSnapshot);

  /*
   * Seed validation is purchase-time validation only.
   * Existing contracts deliberately validate zero submitted seeds here;
   * the immutable patterns/seed IDs are loaded later from the contract.
   */
  const purchaseValidationScheduleIds =
    hasFrozenBookingContract
      ? []
      : selectedScheduleIds;

  const liveEligibilitySnapshot =
    !hasFrozenBookingContract
      ? await getEligibilityPolicySnapshotForSource(source, tx)
      : null;

  const hasSchedulableEntitlement = Boolean(
    liveEligibilitySnapshot &&
      (
        liveEligibilitySnapshot.classIds.length > 0 ||
        liveEligibilitySnapshot.classTypes.length > 0 ||
        (
          "classTypeIds" in liveEligibilitySnapshot &&
          Array.isArray(liveEligibilitySnapshot.classTypeIds) &&
          liveEligibilitySnapshot.classTypeIds.length > 0
        )
      ),
  );

  if (
    selectedScheduleIds.length === 0 &&
    !hasFrozenBookingContract
  ) {
    if (!hasSchedulableEntitlement) {
      return {
        selectedScheduleIds,
        plannedScheduleIds: [] as string[],
        createdCount: 0,
        bookedSchedules: [] as {
          date: Date;
          time: string;
          className: string;
          trainerName: string;
        }[],
      };
    }

    throw new MembershipBookingPlanError(
      "هذا الاشتراك يتطلب اختيار موعد متاح قبل المتابعة إلى الدفع.",
      "back_to_schedule",
    );
  }

  const resolvedPolicy = resolveBookingPolicy({
    kind: plan.kind,
    sessionsCount: plan.sessionsCount,
    durationDays: plan.duration,
  });

  if (!hasFrozenBookingContract) {
    const weekCap = Math.min(12, plan.sessionsCount ?? 12);

    if (selectedScheduleIds.length > weekCap) {
      throw new MembershipBookingPlanError(
        `لا يمكن اختيار أكثر من ${weekCap} موعداً في الأسبوع لهذا الاشتراك.`,
        "back_to_schedule",
      );
    }

    if (resolvedPolicy.minRequiredSelection) {
      const minRequired = resolvedPolicy.minRequiredSelection;

      if (minRequired > weekCap) {
        throw new MembershipBookingPlanError(
          `هذه الباقة تتطلب اختيار ${minRequired} موعداً على الأقل ` +
            `لتغطية ${plan.sessionsCount} حصة خلال ${plan.duration} يوم، ` +
            `وهو أكثر من الحد الأقصى المسموح به. يرجى اختيار باقة مختلفة.`,
          "back_to_plan",
        );
      }

      if (selectedScheduleIds.length < minRequired) {
        const isWeeklyPolicy = resolvedPolicy.minSessionsPerWeek !== null;
        const theoreticalTotal = isWeeklyPolicy
          ? Math.floor(selectedScheduleIds.length * (plan.duration / 7))
          : selectedScheduleIds.length;
        const cadenceLabel = isWeeklyPolicy ? " في الأسبوع" : "";

        throw new MembershipBookingPlanError(
          `عدد المواعيد المختارة (${selectedScheduleIds.length}${cadenceLabel}) لا يكفي لتغطية حصص اشتراكك. ` +
            `بهذا الاختيار ستحصلين على ${theoreticalTotal} حصة فقط خلال مدة الاشتراك (${plan.duration} يوم)، ` +
            `بينما اشتراكك يشمل ${plan.sessionsCount} حصة. ` +
            `يلزم اختيار ${minRequired} مواعيد على الأقل.`,
          "back_to_schedule",
        );
      }
    }
  }

  const week1Schedules = await tx.schedule.findMany({
    where: {
      id: { in: purchaseValidationScheduleIds },
    },
    include: {
      class: {
        include: {
          trainer: true,
        },
      },
    },
  });

  if (
    week1Schedules.length !==
    purchaseValidationScheduleIds.length
  ) {
    throw new MembershipBookingPlanError(
      "تعذر العثور على بعض المواعيد المختارة.",
      "back_to_schedule",
    );
  }

  /*
   * BUSINESS-TIME VALIDATION:
   * Every selected seed schedule must itself fall inside the membership
   * period using the real Africa/Cairo session instant.
   *
   * Schedule.date alone is only a calendar-date anchor and must never be
   * compared directly with membership startDate/endDate.
   */
  for (const schedule of week1Schedules) {
    const slotInstant = scheduleSlotInstant(
      new Date(schedule.date),
      schedule.time,
    );

    /*
     * A seed schedule must not already have started in real time.
     * Membership coverage itself is calendar-day based, so never reject
     * a valid same-day slot merely because the membership was created
     * a few minutes later than midnight.
     */
    if (slotInstant.getTime() <= Date.now()) {
      throw new MembershipBookingPlanError(
        "هذا الموعد بدأ بالفعل، يرجى اختيار موعد قادم.",
        "back_to_schedule",
      );
    }

    const slotDay = cairoCalendarDateKey(slotInstant);
    const membershipStartDay = cairoCalendarDateKey(startDate);
    const membershipEndDay = cairoCalendarDateKey(endDate);

    if (slotDay < membershipStartDay) {
      throw new MembershipBookingPlanError(
        "الموعد المختار يسبق تاريخ بداية الاشتراك.",
        "back_to_schedule",
      );
    }

    if (slotDay > membershipEndDay) {
      throw new MembershipBookingPlanError(
        "أحد المواعيد المختارة خارج مدة الاشتراك.",
        "back_to_schedule",
      );
    }
  }

  /*
   * IMMUTABLE ELIGIBILITY:
   *
   * The first successful purchase validation freezes the entitlement policy.
   * Later payment recovery/retries must use that frozen policy instead of
   * re-reading mutable offer/membership configuration.
   */
  const existingMembershipSnapshot =
    await tx.userMembership.findUnique({
      where: { id: userMembershipId },
      select: {
        eligibilitySnapshot: true,
        bookingPatternSnapshot: true,
      },
    });

  let frozenEligibility: EligibilityPolicySnapshot | null =
    parseEligibilityPolicySnapshot(
      existingMembershipSnapshot?.eligibilitySnapshot,
    );

  // Compatibility for memberships created before eligibilitySnapshot existed.
  if (!frozenEligibility && existingMembershipSnapshot?.bookingPatternSnapshot) {
    try {
      const parsed = JSON.parse(
        existingMembershipSnapshot.bookingPatternSnapshot,
      ) as { eligibility?: unknown };
      if (parsed?.eligibility) {
        frozenEligibility = parseEligibilityPolicySnapshot(
          JSON.stringify(parsed.eligibility),
        );
      }
    } catch {
      // Legacy/invalid booking contracts fall back to source capture below.
    }
  }

  if (!frozenEligibility) {
    // Reuse the purchase-time canonical resolution when available.
    frozenEligibility =
      liveEligibilitySnapshot ??
      await getEligibilityPolicySnapshotForSource(source, tx);
  }

  const selectedClassIds: string[] = [
    ...new Set<string>(
      week1Schedules.map(
        (schedule: { classId: string }) => schedule.classId,
      ),
    ),
  ];

  for (const classId of selectedClassIds) {
    const allowed =
      await isClassAllowedByEligibilitySnapshot(
        frozenEligibility,
        classId,
        tx,
      );

    if (!allowed) {
      throw new MembershipBookingPlanError(
        "أحد الكلاسات المختارة غير مشمول ضمن هذا الاشتراك أو العرض.",
        "back_to_schedule",
      );
    }
  }

  // Health restrictions are a current safety gate at purchase time.
  // Payment recovery remains contract-first and is intentionally not changed here.
  for (const schedule of week1Schedules) {
    await assertUserCanBookClassByHealth(
      tx,
      userId,
      schedule.class.type,
    );
  }

  // Enforce the effective purchase-time daily policy.
  const dayCounts = new Map<string, number>();

  for (const schedule of week1Schedules) {
    const dayKey = new Date(schedule.date)
      .toISOString()
      .slice(0, 10);

    dayCounts.set(
      dayKey,
      (dayCounts.get(dayKey) ?? 0) + 1,
    );
  }

  for (const count of dayCounts.values()) {
    if (count > resolvedPolicy.maxSessionsPerDay) {
      throw new MembershipBookingPlanError(
        `لا يمكن اختيار أكثر من ${resolvedPolicy.maxSessionsPerDay} حصة في اليوم الواحد.`,
        "back_to_schedule",
      );
    }
  }

  if (resolvedPolicy.requireDistinctClassesPerDay) {
    const classIds = week1Schedules.map((schedule: any) => schedule.classId);
    if (new Set(classIds).size !== classIds.length) {
      throw new MembershipBookingPlanError(
        "يجب اختيار كلاسات مختلفة لهذه الباقة.",
        "back_to_schedule",
      );
    }
  }

  if (resolvedPolicy.requireSingleCalendarDay && week1Schedules.length > 0) {
    const selectedDays = new Set(
      week1Schedules.map((schedule: any) =>
        cairoCalendarDateKey(
          scheduleSlotInstant(new Date(schedule.date), schedule.time),
        ),
      ),
    );
    if (selectedDays.size !== 1) {
      throw new MembershipBookingPlanError(
        "يجب أن تكون جميع حصص هذه الباقة في نفس اليوم.",
        "back_to_schedule",
      );
    }
  }

  /*
   * Important for idempotency:
   * a schedule may currently have zero free spots because THIS membership
   * already owns its reservation. That must not make a repeated application
   * fail.
   */
  const existingWeek1ForCurrentMembership =
    await tx.booking.findMany({
      where: {
        userMembershipId,
        scheduleId: {
          in: purchaseValidationScheduleIds,
        },
      },
      select: {
        scheduleId: true,
      },
    });

  const ownedWeek1Ids = new Set(
    existingWeek1ForCurrentMembership.map(
      (booking: { scheduleId: string }) =>
        booking.scheduleId,
    ),
  );

  for (const schedule of week1Schedules) {
    if (!schedule.isActive) {
      throw new MembershipBookingPlanError(
        "أحد المواعيد المختارة غير متاح حاليًا.",
        "back_to_schedule",
      );
    }

    if (
      schedule.availableSpots <= 0 &&
      !ownedWeek1Ids.has(schedule.id)
    ) {
      throw new MembershipBookingPlanError(
        "أحد المواعيد المختارة لم يعد به أماكن متاحة.",
        "back_to_schedule",
      );
    }
  }

  /*
   * RECURRING PATTERN UNIQUENESS
   *
   * Different Schedule rows may represent different calendar occurrences
   * of the exact same recurring class slot. They must never be frozen as
   * multiple weekly entitlements.
   *
   * The immutable contract is defined by:
   *   classId + Cairo weekday + wall-clock time
   */
  const recurringPatternKeys = week1Schedules.map(
    (schedule: any) =>
      patternKey(
        schedule.classId,
        schedule.time,
        scheduleWeekday(new Date(schedule.date)),
      ),
  );

  if (
    new Set(recurringPatternKeys).size !==
    recurringPatternKeys.length
  ) {
    throw new MembershipBookingPlanError(
      "تم اختيار نفس الموعد الأسبوعي أكثر من مرة. يرجى اختيار كل يوم وموعد مرة واحدة فقط.",
      "back_to_schedule",
    );
  }

  /*
   * IMMUTABLE BOOKING CONTRACT
   *
   * The first successful purchase freezes:
   * - purchase source
   * - class eligibility
   * - selected weekly pattern
   * - seed schedule IDs
   * - duration/session policy
   *
   * Recovery/retry may APPLY this contract, but must never rewrite it.
   */
  /*
   * Build the candidate contract from the customer's validated seed choices.
   * This candidate is persisted only if the membership does not already have
   * a contract.
   */
  const proposedPatterns: BookingPattern[] =
    week1Schedules.map((schedule: any) => ({
      classId: schedule.classId,
      time: schedule.time,
      dayOfWeek: scheduleWeekday(
        new Date(schedule.date),
      ),
    }));

  const proposedMinSessionsPerWeek = resolvedPolicy.minSessionsPerWeek;

  const proposedSelectedDayCount = new Set(
    proposedPatterns.map(
      (pattern) => pattern.dayOfWeek,
    ),
  ).size;

  const proposedContract: BookingContract = {
    version: 1,
    timezone: "Africa/Cairo",
    source,
    eligibility: frozenEligibility,
    seedScheduleIds: [...selectedScheduleIds],
    patterns: proposedPatterns,
    policy: {
      durationDays: plan.duration,
      totalSessions: plan.sessionsCount,
      minSessionsPerWeek:
        proposedMinSessionsPerWeek,
      selectedSessionsPerWeek:
        proposedPatterns.length,
      selectedDaysPerWeek:
        proposedSelectedDayCount,
      maxSessionsPerDay: resolvedPolicy.maxSessionsPerDay,
      requireDistinctClassesPerDay: resolvedPolicy.requireDistinctClassesPerDay,
    },
  };

  /*
   * Read the contract again because the earlier eligibility lookup may have
   * observed NULL while another concurrent request was preparing the same
   * membership.
   */
  const currentSnapshot =
    await tx.userMembership.findUnique({
      where: { id: userMembershipId },
      select: { bookingPatternSnapshot: true },
    });

  let bookingContract = parseBookingContract(
    currentSnapshot?.bookingPatternSnapshot,
    userMembershipId,
    selectedScheduleIds,
  );

  if (bookingContract) {
    /*
     * A membership can never switch purchase source after its contract has
     * been frozen. Treat a mismatch as an integrity error rather than silently
     * re-reading mutable configuration.
     */
    if (
      bookingContract.source.type !== source.type ||
      bookingContract.source.id !== source.id
    ) {
      throw new Error(
        `Booking contract source mismatch for membership ${userMembershipId}`,
      );
    }
  } else {
    const serializedContract =
      JSON.stringify(proposedContract);

    /*
     * Atomic first-writer-wins freeze.
     *
     * updateMany + bookingPatternSnapshot:null prevents two simultaneous
     * webhook/recovery requests from overwriting each other's contract.
     */
    const frozen = await tx.userMembership.updateMany({
      where: {
        id: userMembershipId,
        bookingPatternSnapshot: null,
      },
      data: {
        bookingPatternSnapshot:
          serializedContract,
      },
    });

    if (frozen.count === 1) {
      bookingContract = proposedContract;
    } else {
      /*
       * Another request won the race. Reload and use the winner's immutable
       * contract. Never continue with our losing candidate.
       */
      const winner =
        await tx.userMembership.findUnique({
          where: { id: userMembershipId },
          select: {
            bookingPatternSnapshot: true,
          },
        });

      bookingContract = parseBookingContract(
        winner?.bookingPatternSnapshot,
        userMembershipId,
        selectedScheduleIds,
      );

      if (!bookingContract) {
        throw new Error(
          `Booking contract race resolution failed for membership ${userMembershipId}`,
        );
      }
    }
  }

  const ensured = await ensureMembershipBookingsFromContractTx({
    tx,
    userId,
    userMembershipId,
    startDate,
    endDate,
    bookingContract,
    // Booking eligibility is calendar-day based in Africa/Cairo.
    // The real-time cutoff only prevents booking slots that have already started.
    bookingCutoff: new Date(),
  });

  return {
    selectedScheduleIds,
    ...ensured,
  };
}

type EnsureFromContractInput = {
  tx: any;
  userId: string;
  userMembershipId: string;
  startDate: Date;
  endDate: Date;
  bookingContract: BookingContract;
  bookingCutoff: Date;
};

const MAKEUP_GRACE_DAYS = 30;

async function ensureMembershipBookingsFromContractTx({
  tx,
  userId,
  userMembershipId,
  startDate,
  endDate,
  bookingContract,
  bookingCutoff,
}: EnsureFromContractInput) {
  const patterns = bookingContract.patterns;

  const patternSet = new Set(
    patterns.map((pattern) =>
      patternKey(
        pattern.classId,
        pattern.time,
        pattern.dayOfWeek,
      ),
    ),
  );

  const patternClassIds = [
    ...new Set(
      patterns.map((pattern) => pattern.classId),
    ),
  ];

  /*
   * Schedule.date is a Cairo calendar-date anchor stored at UTC midnight.
   * Fetch a padded range, then validate the real Cairo slot instant below.
   */
  const schedulePeriodStart = new Date(startDate);
  schedulePeriodStart.setUTCDate(
    schedulePeriodStart.getUTCDate() - 1,
  );
  schedulePeriodStart.setUTCHours(0, 0, 0, 0);

  const schedulePeriodEnd = new Date(endDate);
  schedulePeriodEnd.setUTCDate(
    schedulePeriodEnd.getUTCDate() + 1,
  );
  schedulePeriodEnd.setUTCHours(23, 59, 59, 999);

  /*
   * Make-up inventory is intentionally bounded.
   * It can recover missing immutable entitlement only.
   * It does NOT extend the contractual membership duration.
   */
  const membershipStartDay = cairoCalendarDateKey(startDate);
  const membershipEndDay = cairoCalendarDateKey(endDate);

  const makeupEndDate = new Date(endDate);
  makeupEndDate.setUTCDate(
    makeupEndDate.getUTCDate() + MAKEUP_GRACE_DAYS,
  );
  const makeupEndDay = cairoCalendarDateKey(makeupEndDate);

  const makeupSchedulePeriodEnd = new Date(makeupEndDate);
  makeupSchedulePeriodEnd.setUTCDate(
    makeupSchedulePeriodEnd.getUTCDate() + 1,
  );
  makeupSchedulePeriodEnd.setUTCHours(23, 59, 59, 999);

  /*
   * Primary inventory:
   * exact immutable customer-selected weekly patterns.
   */
  const patternSchedules = await tx.schedule.findMany({
    where: {
      classId: {
        in: patternClassIds,
      },
      date: {
        gte: schedulePeriodStart,
        lte: schedulePeriodEnd,
      },
      isActive: true,
    },
    include: {
      class: {
        include: {
          trainer: true,
        },
      },
    },
    orderBy: [
      { date: "asc" },
      { time: "asc" },
      { id: "asc" },
    ],
  });

  const repeated = patternSchedules.filter(
    (schedule: any) => {
      const slotInstant = scheduleSlotInstant(
        new Date(schedule.date),
        schedule.time,
      );

      const slotDay = cairoCalendarDateKey(slotInstant);
      if (
        slotDay < membershipStartDay ||
        slotDay > membershipEndDay
      ) {
        return false;
      }

      return patternSet.has(
        patternKey(
          schedule.classId,
          schedule.time,
          scheduleWeekday(
            new Date(schedule.date),
          ),
        ),
      );
    },
  );

  /*
   * Entitlement is immutable and comes only from the frozen contract.
   */
  const totalLimit =
    bookingContract.policy.totalSessions ??
    Math.round(
      bookingContract.policy.selectedSessionsPerWeek *
        (bookingContract.policy.durationDays / 7),
    );

  const countedStatuses = [
    "confirmed",
    "attended",
    "noshow",
  ];

  const existingEntitlementBookings =
    await tx.booking.findMany({
      where: {
        userMembershipId,
        status: {
          in: countedStatuses,
        },
      },
      include: {
        schedule: {
          select: {
            id: true,
            classId: true,
            date: true,
            time: true,
          },
        },
      },
    });

  const existingEntitlementUnits =
    sumMembershipBookingUnits(
      existingEntitlementBookings,
      countedStatuses,
    );

  let remainingToCreate = Math.max(
    0,
    totalLimit -
      existingEntitlementUnits,
  );

  const bookingDateKey = (date: Date) =>
    new Date(date).toISOString().slice(0, 10);

  /*
   * Track the membership's daily usage.
   * This is enforced during reconciliation too, not only purchase.
   */
  const membershipDayCounts =
    new Map<string, number>();

  for (const booking of existingEntitlementBookings) {
    const key = bookingDateKey(
      booking.schedule.date,
    );

    membershipDayCounts.set(
      key,
      (membershipDayCounts.get(key) ?? 0) + 1,
    );
  }

  const maxSessionsPerDay =
    bookingContract.policy.maxSessionsPerDay;

  const week1IdSet = new Set(
    bookingContract.seedScheduleIds,
  );

  let createdCount = 0;
  let makeupCreatedCount = 0;

  const plannedScheduleIds: string[] = [];

  /*
   * Shared safe booking primitive.
   *
   * Returns true only when a new entitlement booking was actually created.
   * Existing owned booking is idempotent and returns false.
   */
  const tryBookSchedule = async (
    schedule: any,
    options: {
      strictWeek1: boolean;
      allowAfterEnd?: boolean;
      isMakeup?: boolean;
    },
  ): Promise<boolean> => {
    if (remainingToCreate <= 0) {
      return false;
    }

    const slotInstant = scheduleSlotInstant(
      new Date(schedule.date),
      schedule.time,
    );

    const slotDay = cairoCalendarDateKey(slotInstant);
    const allowedEndDay =
      options.allowAfterEnd
        ? makeupEndDay
        : membershipEndDay;

    if (
      slotInstant.getTime() < bookingCutoff.getTime() ||
      slotDay < membershipStartDay ||
      slotDay > allowedEndDay
    ) {
      return false;
    }

    /*
     * A make-up booking must really be outside the normal contractual
     * period. Normal Phase 1/2 bookings remain strictly <= endDate.
     */
    if (
      options.isMakeup &&
      slotDay <= membershipEndDay
    ) {
      return false;
    }

    const dayKey = bookingDateKey(
      new Date(schedule.date),
    );

    if (
      (membershipDayCounts.get(dayKey) ?? 0) >=
      maxSessionsPerDay
    ) {
      return false;
    }

    /*
     * Serialize capacity decisions on the Schedule row.
     *
     * IMPORTANT: use the values returned by the locking read itself.
     * Under MySQL/MariaDB REPEATABLE READ, a normal Prisma findUnique()
     * after waiting on FOR UPDATE may still observe an older consistent
     * snapshot that was established earlier in this transaction. That can
     * allow two contenders to both see the final spot as available.
     */
    const lockedScheduleRows = await tx.$queryRaw<any[]>`
      SELECT \`id\`, \`availableSpots\`, \`isActive\`
      FROM \`Schedule\`
      WHERE \`id\` = ${schedule.id}
      FOR UPDATE
    `;

    const lockedSchedule = lockedScheduleRows[0];

    const owned = await tx.booking.findFirst({
      where: {
        userMembershipId,
        scheduleId: schedule.id,
        status: {
          in: countedStatuses,
        },
      },
      select: {
        id: true,
      },
    });

    if (owned) {
      return false;
    }

    /*
     * Strong user conflict protection:
     * same customer cannot occupy another counted booking
     * at the same Cairo calendar date + clock time,
     * even if it belongs to another Schedule row/class/membership.
     */
    const sameTimeConflict =
      await tx.booking.findFirst({
        where: {
          userId,
          status: {
            in: countedStatuses,
          },
          schedule: {
            date: schedule.date,
            time: schedule.time,
          },
        },
        select: {
          id: true,
          scheduleId: true,
          userMembershipId: true,
        },
      });

    if (sameTimeConflict) {
      if (options.strictWeek1) {
        throw new MembershipBookingPlanError(
          "أحد المواعيد المختارة يتعارض مع حجز آخر في نفس اليوم والساعة.",
          "back_to_schedule",
        );
      }

      return false;
    }

    const lockedIsActive =
      lockedSchedule?.isActive === true ||
      Number(lockedSchedule?.isActive) === 1;
    const lockedAvailableSpots = Number(
      lockedSchedule?.availableSpots ?? 0,
    );

    if (
      !lockedSchedule ||
      !lockedIsActive ||
      !Number.isFinite(lockedAvailableSpots) ||
      lockedAvailableSpots <= 0
    ) {
      if (options.strictWeek1) {
        throw new MembershipBookingPlanError(
          "أحد المواعيد المختارة لم يعد به أماكن متاحة.",
          "back_to_schedule",
        );
      }

      return false;
    }

    await tx.booking.create({
      data: {
        userId,
        scheduleId: schedule.id,
        userMembershipId,
        status: "confirmed",
        paidAmount: schedule.class.price,
        paymentMethod: "cash",
        isMakeup: options.isMakeup === true,
        makeupReason:
          options.isMakeup === true
            ? "entitlement_recovery"
            : null,
      },
    });

    await tx.schedule.update({
      where: {
        id: schedule.id,
      },
      data: {
        availableSpots: {
          decrement: 1,
        },
      },
    });

    membershipDayCounts.set(
      dayKey,
      (membershipDayCounts.get(dayKey) ?? 0) + 1,
    );

    remainingToCreate--;
    createdCount++;

    if (options.isMakeup === true) {
      makeupCreatedCount++;
    }

    plannedScheduleIds.push(schedule.id);

    return true;
  };

  /*
   * PHASE 1:
   * Preserve the exact frozen recurring pattern.
   */
  const primarySchedules = repeated.filter(
    (schedule: any) =>
      scheduleSlotInstant(
        new Date(schedule.date),
        schedule.time,
      ).getTime() >= bookingCutoff.getTime(),
  );

  for (const schedule of primarySchedules) {
    if (remainingToCreate <= 0) break;

    await tryBookSchedule(schedule, {
      strictWeek1:
        week1IdSet.has(schedule.id),
    });
  }

  /*
   * PHASE 2 — ENTITLEMENT MAKE-UP FALLBACK
   *
   * If historical cleanup, cancellation, capacity, or missing recurring
   * inventory leaves the membership below its immutable totalSessions,
   * search for FUTURE schedules allowed by the frozen eligibility.
   *
   * Priority:
   * 1. selected pattern class IDs
   * 2. other classes allowed by the frozen entitlement
   *
   * Never:
   * - recreate the past
   * - exceed membership endDate
   * - exceed maxSessionsPerDay
   * - double-book the user at the same date/time
   * - exceed capacity
   * - exceed totalSessions
   */
  if (remainingToCreate > 0) {
    const fallbackInventory =
      await tx.schedule.findMany({
        where: {
          date: {
            gte: schedulePeriodStart,
            lte: schedulePeriodEnd,
          },
          isActive: true,
        },
        include: {
          class: {
            include: {
              trainer: true,
            },
          },
        },
        orderBy: [
          { date: "asc" },
          { time: "asc" },
          { id: "asc" },
        ],
      });

    const eligibilityMemo =
      new Map<string, boolean>();

    const fallbackCandidates: any[] = [];

    for (const schedule of fallbackInventory) {
      const slotInstant = scheduleSlotInstant(
        new Date(schedule.date),
        schedule.time,
      );

      const slotDay = cairoCalendarDateKey(slotInstant);
      if (
        slotInstant.getTime() < bookingCutoff.getTime() ||
        slotDay < membershipStartDay ||
        slotDay > membershipEndDay
      ) {
        continue;
      }

      let allowed =
        eligibilityMemo.get(schedule.classId);

      if (allowed === undefined) {
        allowed =
          await isClassAllowedByEligibilitySnapshot(
            bookingContract.eligibility,
            schedule.classId,
          );

        eligibilityMemo.set(
          schedule.classId,
          allowed,
        );
      }

      if (!allowed) continue;

      fallbackCandidates.push(schedule);
    }

    /*
     * Prefer the customer's originally selected class IDs.
     * Within each priority group keep chronological order.
     */
    fallbackCandidates.sort((a, b) => {
      const aPreferred =
        patternClassIds.includes(a.classId)
          ? 0
          : 1;

      const bPreferred =
        patternClassIds.includes(b.classId)
          ? 0
          : 1;

      if (aPreferred !== bPreferred) {
        return aPreferred - bPreferred;
      }

      const aInstant = scheduleSlotInstant(
        new Date(a.date),
        a.time,
      ).getTime();

      const bInstant = scheduleSlotInstant(
        new Date(b.date),
        b.time,
      ).getTime();

      if (aInstant !== bInstant) {
        return aInstant - bInstant;
      }

      return String(a.id).localeCompare(
        String(b.id),
      );
    });

    for (const schedule of fallbackCandidates) {
      if (remainingToCreate <= 0) break;

      await tryBookSchedule(schedule, {
        strictWeek1: false,
      });
    }
  }

  /*
   * PHASE 3 — BOUNDED POST-END MAKE-UP
   *
   * Only runs when:
   * - immutable entitlement is still missing
   * - Phase 1 + Phase 2 could not satisfy it inside endDate
   *
   * This does NOT extend the membership.
   * It creates only the missing number of specifically marked bookings
   * within MAKEUP_GRACE_DAYS after contractual endDate.
   */
  if (remainingToCreate > 0) {
    const makeupInventory =
      await tx.schedule.findMany({
        where: {
          date: {
            gte: schedulePeriodEnd,
            lte: makeupSchedulePeriodEnd,
          },
          isActive: true,
        },
        include: {
          class: {
            include: {
              trainer: true,
            },
          },
        },
        orderBy: [
          { date: "asc" },
          { time: "asc" },
          { id: "asc" },
        ],
      });

    const makeupEligibilityMemo =
      new Map<string, boolean>();

    const makeupCandidates: any[] = [];

    for (const schedule of makeupInventory) {
      const slotInstant = scheduleSlotInstant(
        new Date(schedule.date),
        schedule.time,
      );

      /*
       * Strictly after contractual endDate and never in the past.
       */
      const slotDay = cairoCalendarDateKey(slotInstant);
      if (
        slotDay <= membershipEndDay ||
        slotInstant.getTime() < bookingCutoff.getTime() ||
        slotDay > makeupEndDay
      ) {
        continue;
      }

      let allowed =
        makeupEligibilityMemo.get(schedule.classId);

      if (allowed === undefined) {
        allowed =
          await isClassAllowedByEligibilitySnapshot(
            bookingContract.eligibility,
            schedule.classId,
          );

        makeupEligibilityMemo.set(
          schedule.classId,
          allowed,
        );
      }

      if (!allowed) continue;

      makeupCandidates.push(schedule);
    }

    /*
     * Same preference rule:
     * selected pattern classes first,
     * then other frozen-eligible classes,
     * always chronological.
     */
    makeupCandidates.sort((a, b) => {
      const aPreferred =
        patternClassIds.includes(a.classId)
          ? 0
          : 1;

      const bPreferred =
        patternClassIds.includes(b.classId)
          ? 0
          : 1;

      if (aPreferred !== bPreferred) {
        return aPreferred - bPreferred;
      }

      const aInstant = scheduleSlotInstant(
        new Date(a.date),
        a.time,
      ).getTime();

      const bInstant = scheduleSlotInstant(
        new Date(b.date),
        b.time,
      ).getTime();

      if (aInstant !== bInstant) {
        return aInstant - bInstant;
      }

      return String(a.id).localeCompare(
        String(b.id),
      );
    });

    for (const schedule of makeupCandidates) {
      if (remainingToCreate <= 0) break;

      await tryBookSchedule(schedule, {
        strictWeek1: false,
        allowAfterEnd: true,
        isMakeup: true,
      });
    }
  }

  /*
   * Always return ACTUAL database truth.
   */
  const actualBookings =
    await tx.booking.findMany({
      where: {
        userMembershipId,
        status: {
          in: countedStatuses,
        },
      },
      include: {
        schedule: {
          include: {
            class: {
              include: {
                trainer: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          schedule: {
            date: "asc",
          },
        },
        {
          schedule: {
            time: "asc",
          },
        },
        {
          createdAt: "asc",
        },
      ],
    });

  const actualEntitlementUnits =
    sumMembershipBookingUnits(
      actualBookings,
      countedStatuses,
    );

  const remainingEntitlement = Math.max(
    0,
    totalLimit - actualEntitlementUnits,
  );

  return {
    plannedScheduleIds,
    createdCount,
    makeupCreatedCount,
    totalEntitlement: totalLimit,
    remainingEntitlement,
    underEntitlement:
      remainingEntitlement > 0,
    bookedSchedules: actualBookings.map(
      (booking: any) => ({
        scheduleId: booking.scheduleId,
        date: booking.schedule.date,
        time: booking.schedule.time,
        className:
          booking.schedule.class.name,
        trainerName:
          booking.schedule.class.trainer?.name ??
          "",
      }),
    ),
  };
}


type EnsureMembershipBookingsInput = {
  tx: any;
  userMembershipId: string;
};

/**
 * Reconcile an existing membership exclusively from its immutable
 * bookingPatternSnapshot.
 *
 * This function does NOT read mutable offer/membership eligibility and does
 * NOT require the original selectedScheduleIds.
 *
 * Intended callers:
 * - paid recovery
 * - reconciliation cron
 * - future schedule generation hooks
 */
export async function ensureMembershipBookingsTx({
  tx,
  userMembershipId,
}: EnsureMembershipBookingsInput) {
  const membership = await tx.userMembership.findUnique({
    where: { id: userMembershipId },
    select: {
      id: true,
      userId: true,
      startDate: true,
      endDate: true,
      bookingPatternSnapshot: true,
    },
  });

  if (!membership) {
    throw new Error(
      `Booking reconciliation failed: membership ${userMembershipId} not found`,
    );
  }

  const bookingContract = parseBookingContract(
    membership.bookingPatternSnapshot,
    userMembershipId,
  );

  if (!bookingContract) {
    throw new Error(
      `Booking reconciliation failed: membership ${userMembershipId} has no frozen booking contract`,
    );
  }

  return ensureMembershipBookingsFromContractTx({
    tx,
    userId: membership.userId,
    userMembershipId: membership.id,
    startDate: membership.startDate,
    endDate: membership.endDate,
    bookingContract,

    // Standalone ensure() is reconciliation/recovery.
    // Never recreate an already-started missing session.
    bookingCutoff: new Date(),
  });
}

