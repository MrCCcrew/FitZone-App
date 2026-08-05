export type MembershipClassRestriction = {
  allowedClassTypesSnapshot: string | null;
  membership: { classSessions: string | null } | null;
};

export type EligibleGymClass = { id: string; type: string | null };

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function parseRestriction(value: string | null) {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(normalized).filter(Boolean) : null;
  } catch {
    // Invalid legacy data keeps the legacy unrestricted policy.
    return null;
  }
}

function parseClassSessions(value: string | null) {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    // Return empty array if parsed is [], not null (empty = zero classes)
    const result = parsed.flatMap((entry) => {
      if (typeof entry === "string") {
        return [normalized(entry)].filter(Boolean);
      }
      if (!entry || typeof entry !== "object") return [];
      const session = entry as { classId?: unknown; classType?: unknown };
      // Prefer classId over classType - do not combine both
      const classId = normalized(session.classId);
      if (classId) return [classId];
      const legacyClassType = normalized(session.classType);
      return legacyClassType ? [legacyClassType] : [];
    });
    return result; // Can be empty array (zero classes) or array with values
  } catch {
    return null;
  }
}

/** Server-side source of truth for membership class eligibility. */
export function canMembershipBookClass(membership: MembershipClassRestriction, gymClass: EligibleGymClass) {
  const snapshotTypes = parseRestriction(membership.allowedClassTypesSnapshot);
  // Legacy: empty snapshot = unrestricted for backward compatibility
  if (snapshotTypes) return snapshotTypes.length === 0 || snapshotTypes.includes(normalized(gymClass.type));

  const sessions = parseClassSessions(membership.membership?.classSessions ?? null);
  // null = unrestricted (no classSessions defined)
  if (sessions === null) return true;
  // Empty array = zero classes allowed
  if (sessions.length === 0) return false;
  // Check if class matches by ID or type
  const classType = normalized(gymClass.type);
  return sessions.includes(gymClass.id) || sessions.includes(classType);
}

export function resolveAllowedClassIds<T extends EligibleGymClass>(membership: MembershipClassRestriction | null | undefined, classes: T[]) {
  if (!membership) return classes.map((gymClass) => gymClass.id);
  return classes.filter((gymClass) => canMembershipBookClass(membership, gymClass)).map((gymClass) => gymClass.id);
}

export type MembershipClassEligibility = {
  hasEligibleMembership: boolean;
  unrestricted: boolean;
  allowedClassIds: string[];
  eligibleMembershipIds: string[];
};

export type MembershipEligibilityRecord = MembershipClassRestriction & {
  id: string;
  offerId?: string | null;
  status: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Existing policy: any active membership without selected classes is
 * unrestricted. Restricted memberships contribute the union of their classes.
 *
 * NEW: For offer-based memberships, checks OfferAllowedClass for specific class filtering.
 */
export async function resolveMembershipClassEligibility(input: {
  userId: string;
  classes: EligibleGymClass[];
  now?: Date;
  memberships?: MembershipEligibilityRecord[];
}): Promise<MembershipClassEligibility> {
  const now = input.now ?? new Date();
  const memberships = input.memberships ?? await (async () => {
    const { db } = await import("@/lib/db");
    return db.userMembership.findMany({
      where: { userId: input.userId, status: "active", startDate: { lte: now }, endDate: { gte: now } },
      include: { membership: { select: { classSessions: true } } },
    });
  })();

  const eligible = memberships.filter((membership) =>
    membership.status === "active" && membership.startDate <= now && membership.endDate >= now,
  );

  const eligibleMembershipIds = eligible.map((membership) => membership.id);
  if (!eligible.length) return { hasEligibleMembership: false, unrestricted: false, allowedClassIds: [], eligibleMembershipIds: [] };

  // Check for unrestricted memberships (no class filtering)
  const unrestricted = eligible.some((membership) => {
    // Skip offer-based memberships (they use OfferAllowedClass)
    if (membership.offerId) return false;

    const snapshot = parseRestriction(membership.allowedClassTypesSnapshot);
    // Legacy: empty snapshot array means unrestricted (for backward compatibility)
    if (snapshot) return snapshot.length === 0;
    const sessions = parseClassSessions(membership.membership?.classSessions ?? null);
    // NEW: null = unrestricted, empty array = zero classes (not unrestricted)
    return sessions === null;
  });

  // If unrestricted, return early
  if (unrestricted) {
    return { hasEligibleMembership: true, unrestricted: true, allowedClassIds: [], eligibleMembershipIds };
  }

  // Collect allowed class IDs from all eligible memberships
  const { getEligibleClassesForSource } = await import("@/lib/get-eligible-classes");
  const allowedClassIdsSet = new Set<string>();

  for (const membership of eligible) {
    if (membership.offerId) {
      // Use OfferAllowedClass for offer-based memberships
      const offerClasses = await getEligibleClassesForSource({
        type: "offer",
        id: membership.offerId,
      });
      offerClasses.forEach((cls) => allowedClassIdsSet.add(cls.id));
    } else {
      // Use legacy logic for non-offer memberships
      const membershipAllowed = input.classes.filter((gymClass) =>
        canMembershipBookClass(membership, gymClass)
      );
      membershipAllowed.forEach((cls) => allowedClassIdsSet.add(cls.id));
    }
  }

  const allowedClassIds = Array.from(allowedClassIdsSet);
  return { hasEligibleMembership: true, unrestricted: false, allowedClassIds, eligibleMembershipIds };
}
