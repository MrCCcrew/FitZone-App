import {
  isClassAllowedByEligibilitySnapshot,
  parseEligibilityPolicySnapshot,
  type EligibilityPolicySnapshot,
} from "@/lib/get-eligible-classes";

export type MembershipClassRestriction = {
  eligibilitySnapshot?: string | null;
  bookingPatternSnapshot?: string | null;
  allowedClassTypesSnapshot: string | null;
  membership: { classSessions: string | null } | null;
};

export type EligibleGymClass = {
  id: string;
  type: string | null;
  classTypeId?: string | null;
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function parseLegacyTypeRestriction(value: string | null) {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(normalized).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

function parseExactClassSessionIds(value: string | null) {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;

    return [
      ...new Set(
        parsed
          .map((entry) => {
            if (typeof entry === "string") return entry.trim();
            if (!entry || typeof entry !== "object") return "";
            const classId = (entry as { classId?: unknown }).classId;
            return typeof classId === "string" ? classId.trim() : "";
          })
          .filter(Boolean),
      ),
    ];
  } catch {
    return null;
  }
}

function parseLegacyPackageFrozenClassIds(
  value: string | null | undefined,
): string[] | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as {
      source?: {
        type?: unknown;
      };
      eligibility?: {
        mode?: unknown;
        classIds?: unknown;
      };
    };

    if (parsed?.source?.type !== "package") return null;

    if (
      parsed?.eligibility?.mode !== "class_ids" ||
      !Array.isArray(parsed.eligibility.classIds)
    ) {
      return null;
    }

    return [
      ...new Set(
        parsed.eligibility.classIds
          .filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
          .map((value) => value.trim()),
      ),
    ];
  } catch {
    return null;
  }
}

function parseBookingPatternEligibility(
  value: string | null | undefined,
): EligibilityPolicySnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as { eligibility?: unknown };
    if (!parsed?.eligibility) return null;
    return parseEligibilityPolicySnapshot(JSON.stringify(parsed.eligibility));
  } catch {
    return null;
  }
}

/**
 * Resolve the immutable entitlement attached to one purchased membership.
 *
 * Priority is intentionally strict:
 * 1. canonical UserMembership.eligibilitySnapshot
 * 2. legacy bookingPatternSnapshot.eligibility
 * 3. legacy offer text snapshot
 * 4. legacy Membership.classSessions exact class IDs
 *
 * ClassType is never allowed to broaden Membership.classSessions semantics.
 */
export function getMembershipFrozenEligibility(
  membership: MembershipClassRestriction,
): EligibilityPolicySnapshot | null {
  const canonical = parseEligibilityPolicySnapshot(
    membership.eligibilitySnapshot ?? null,
  );
  if (canonical) return canonical;

  const bookingContract = parseBookingPatternEligibility(
    membership.bookingPatternSnapshot ?? null,
  );
  if (bookingContract) return bookingContract;

  const legacyTypes = parseLegacyTypeRestriction(
    membership.allowedClassTypesSnapshot,
  );
  if (legacyTypes) {
    return {
      mode: "class_types",
      classIds: [],
      classTypes: legacyTypes,
    };
  }

  const classIds = parseExactClassSessionIds(
    membership.membership?.classSessions ?? null,
  );
  if (classIds !== null) {
    return {
      mode: "class_ids",
      classIds,
      classTypes: [],
    };
  }

  return null;
}

/**
 * One membership -> one class decision.
 * Null frozen eligibility is legacy unrestricted behavior only.
 */
export async function canMembershipBookClass(
  membership: MembershipClassRestriction,
  gymClass: EligibleGymClass,
): Promise<boolean> {
  const frozen = getMembershipFrozenEligibility(membership);
  if (!frozen) return true;

  // Preserve the historical meaning of an explicit empty offer text snapshot:
  // [] was unrestricted before the canonical snapshot existed.
  if (
    !membership.eligibilitySnapshot &&
    !parseBookingPatternEligibility(membership.bookingPatternSnapshot ?? null) &&
    membership.allowedClassTypesSnapshot != null &&
    frozen.mode === "class_types" &&
    frozen.classTypes.length === 0
  ) {
    return true;
  }

  return isClassAllowedByEligibilitySnapshot(frozen, gymClass.id);
}

export async function resolveAllowedClassIds<T extends EligibleGymClass>(
  membership: MembershipClassRestriction | null | undefined,
  classes: T[],
) {
  if (!membership) return classes.map((gymClass) => gymClass.id);

  const allowed: string[] = [];
  for (const gymClass of classes) {
    if (await canMembershipBookClass(membership, gymClass)) {
      allowed.push(gymClass.id);
    }
  }
  return allowed;
}

export type MembershipClassEligibility = {
  hasEligibleMembership: boolean;
  unrestricted: boolean;
  allowedClassIds: string[];
  eligibleMembershipIds: string[];
  membershipIdsByClass: Record<string, string[]>;
};

export type MembershipEligibilityRecord = MembershipClassRestriction & {
  id: string;
  offerId?: string | null;
  status: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Single server-side engine for purchased membership class entitlement.
 *
 * It never re-reads mutable Offer/Membership/Package configuration after
 * purchase when a frozen entitlement exists. Multiple active memberships
 * contribute the union of their exact allowed classes.
 */
export async function resolveMembershipClassEligibility(input: {
  userId: string;
  classes: EligibleGymClass[];
  now?: Date;
  memberships?: MembershipEligibilityRecord[];
}): Promise<MembershipClassEligibility> {
  const now = input.now ?? new Date();
  const memberships =
    input.memberships ??
    (await (async () => {
      const { db } = await import("@/lib/db");
      return db.userMembership.findMany({
        where: {
          userId: input.userId,
          status: "active",
          startDate: { lte: now },
          endDate: { gte: now },
        },
        orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
        select: {
          id: true,
          offerId: true,
          status: true,
          startDate: true,
          endDate: true,
          eligibilitySnapshot: true,
          bookingPatternSnapshot: true,
          allowedClassTypesSnapshot: true,
          membership: { select: { classSessions: true } },
        },
      });
    })());

  const active = memberships.filter(
    (membership) =>
      membership.status === "active" &&
      membership.startDate <= now &&
      membership.endDate >= now,
  );

  if (!active.length) {
    return {
      hasEligibleMembership: false,
      unrestricted: false,
      allowedClassIds: [],
      eligibleMembershipIds: [],
      membershipIdsByClass: {},
    };
  }

  const membershipIdsByClass: Record<string, string[]> = {};
  const allowedClassIds: string[] = [];
  const grantingMembershipIds = new Set<string>();
  let unrestricted = false;

  /*
   * Legacy package compatibility.
   *
   * Some historical package memberships have no canonical eligibilitySnapshot
   * and incorrectly contain only the initially selected Class IDs inside
   * bookingPatternSnapshot.eligibility.
   *
   * Those selected Class IDs are already frozen purchase data. Resolve their
   * stable ClassType IDs once and use those types as the historical package
   * entitlement. Do NOT re-read mutable Membership.classSessions.
   */
  const legacyFrozenClassIdsByMembership = new Map<string, string[]>();

  for (const membership of active) {
    const frozenClassIds = parseLegacyPackageFrozenClassIds(
      membership.bookingPatternSnapshot,
    );

    if (!frozenClassIds || frozenClassIds.length === 0) {
      continue;
    }

    /*
     * Transitional package compatibility.
     *
     * Some historical package purchases copied the initially selected
     * package Class IDs into BOTH bookingPatternSnapshot.eligibility and
     * the canonical eligibilitySnapshot.
     *
     * Treat that canonical class_ids snapshot as the same historical
     * package shape only when both frozen sources contain EXACTLY the
     * same Class IDs.
     *
     * This intentionally does NOT read mutable Membership.classSessions
     * and does NOT widen non-package, mixed, class-type, malformed, or
     * mismatched canonical entitlements.
     */
    if (membership.eligibilitySnapshot) {
      const canonical = parseEligibilityPolicySnapshot(
        membership.eligibilitySnapshot,
      );

      if (
        !canonical ||
        canonical.mode !== "class_ids" ||
        canonical.classIds.length === 0
      ) {
        continue;
      }

      const canonicalIds = [
        ...new Set(canonical.classIds),
      ].sort();

      const contractIds = [
        ...new Set(frozenClassIds),
      ].sort();

      if (
        canonicalIds.length !== contractIds.length ||
        canonicalIds.some(
          (id, index) => id !== contractIds[index],
        )
      ) {
        continue;
      }
    }

    legacyFrozenClassIdsByMembership.set(
      membership.id,
      frozenClassIds,
    );
  }

  const allLegacyFrozenClassIds = [
    ...new Set(
      [...legacyFrozenClassIdsByMembership.values()].flat(),
    ),
  ];

  const legacyClassTypeRows =
    allLegacyFrozenClassIds.length > 0
      ? await (async () => {
          const { db } = await import("@/lib/db");

          return db.class.findMany({
            where: {
              id: { in: allLegacyFrozenClassIds },
            },
            select: {
              id: true,
              classTypeId: true,
            },
          });
        })()
      : [];

  const frozenTypeIdByClassId = new Map<string, string>();

  for (const row of legacyClassTypeRows) {
    if (row.classTypeId) {
      frozenTypeIdByClassId.set(
        row.id,
        row.classTypeId,
      );
    }
  }

  const legacyAllowedTypeIdsByMembership =
    new Map<string, Set<string>>();

  for (const [membershipId, frozenClassIds] of
    legacyFrozenClassIdsByMembership) {
    const typeIds = new Set<string>();

    for (const classId of frozenClassIds) {
      const typeId = frozenTypeIdByClassId.get(classId);
      if (typeId) typeIds.add(typeId);
    }

    if (typeIds.size > 0) {
      legacyAllowedTypeIdsByMembership.set(
        membershipId,
        typeIds,
      );
    }
  }

  for (const gymClass of input.classes) {
    const classMembershipIds: string[] = [];

    for (const membership of active) {
      const frozen = getMembershipFrozenEligibility(membership);
      if (!frozen) unrestricted = true;

      const legacyAllowedTypeIds =
        legacyAllowedTypeIdsByMembership.get(membership.id);

      const legacyPackageAllowed =
        Boolean(
          legacyAllowedTypeIds &&
          gymClass.classTypeId &&
          legacyAllowedTypeIds.has(gymClass.classTypeId),
        );

      const allowed =
        legacyAllowedTypeIds
          ? legacyPackageAllowed
          : await canMembershipBookClass(
              membership,
              gymClass,
            );

      if (allowed) {
        classMembershipIds.push(membership.id);
        grantingMembershipIds.add(membership.id);
      }
    }

    if (classMembershipIds.length > 0) {
      allowedClassIds.push(gymClass.id);
      membershipIdsByClass[gymClass.id] = classMembershipIds;
    }
  }

  return {
    hasEligibleMembership: true,
    unrestricted,
    allowedClassIds: unrestricted ? [] : allowedClassIds,
    eligibleMembershipIds: active
      .map((membership) => membership.id)
      .filter((id) => grantingMembershipIds.has(id) || unrestricted),
    membershipIdsByClass,
  };
}
