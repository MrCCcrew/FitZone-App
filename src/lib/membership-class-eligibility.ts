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
    return parsed.flatMap((entry) => {
      if (typeof entry === "string") return [normalized(entry)];
      if (!entry || typeof entry !== "object") return [];
      const session = entry as { classId?: unknown; classType?: unknown };
      return [normalized(session.classId), normalized(session.classType)].filter(Boolean);
    });
  } catch {
    return null;
  }
}

/** Server-side source of truth for membership class eligibility. */
export function canMembershipBookClass(membership: MembershipClassRestriction, gymClass: EligibleGymClass) {
  const snapshotTypes = parseRestriction(membership.allowedClassTypesSnapshot);
  if (snapshotTypes) return snapshotTypes.length === 0 || snapshotTypes.includes(normalized(gymClass.type));

  const sessions = parseClassSessions(membership.membership?.classSessions ?? null);
  if (!sessions) return true;
  const classType = normalized(gymClass.type);
  return sessions.length === 0 || sessions.includes(gymClass.id) || sessions.includes(classType);
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
  status: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Existing policy: any active membership without selected classes is
 * unrestricted. Restricted memberships contribute the union of their classes.
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

  const unrestricted = eligible.some((membership) => {
    const snapshot = parseRestriction(membership.allowedClassTypesSnapshot);
    if (snapshot) return snapshot.length === 0;
    const sessions = parseClassSessions(membership.membership?.classSessions ?? null);
    return sessions === null || sessions.length === 0;
  });
  const allowedClassIds = unrestricted
    ? []
    : input.classes.filter((gymClass) => eligible.some((membership) => canMembershipBookClass(membership, gymClass))).map((gymClass) => gymClass.id);

  return { hasEligibleMembership: true, unrestricted, allowedClassIds: [...new Set(allowedClassIds)], eligibleMembershipIds };
}
