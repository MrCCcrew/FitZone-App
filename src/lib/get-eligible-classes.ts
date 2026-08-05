/**
 * Unified function to get eligible classes for any source type
 * (Offer, Membership, Package)
 *
 * This is the single source of truth for class eligibility across the app.
 * Use this in:
 * - Customer UI (class selection)
 * - Booking API (validation)
 * - Admin UI (preview)
 * - AI Coach (recommendations)
 */

import { db } from "@/lib/db";

export type SourceType = "offer" | "membership" | "package";

export interface EligibilitySource {
  type: SourceType;
  id: string;
}

export interface EligibleClass {
  id: string;
  name: string;
  type: string;
  trainer: string;
  isActive: boolean;
}

interface OfferClassEligibilityOptions {
  includeInactive?: boolean;
  logLegacyFallback?: boolean;
}

/**
 * Get eligible classes for an Offer
 *
 * Priority:
 * 1. Direct OfferAllowedClass links (new system)
 * 2. Legacy OfferAllowedClassType fallback (temporary)
 * 3. Empty = ZERO classes (NOT all classes)
 */
async function getEligibleClassesForOffer(
  offerId: string,
  options: OfferClassEligibilityOptions = {}
): Promise<EligibleClass[]> {
  const { includeInactive = false, logLegacyFallback = true } = options;

  // 1. Try direct class links first (new system)
  const directLinks = await db.offerAllowedClass.findMany({
    where: { offerId },
    include: {
      class: {
        include: {
          trainer: { select: { name: true } },
        },
      },
    },
  });

  if (directLinks.length > 0) {
    // Found direct links - use them
    return directLinks
      .filter((link) => includeInactive || link.class.isActive)
      .map((link) => ({
        id: link.class.id,
        name: link.class.name,
        type: link.class.type,
        trainer: link.class.trainer.name,
        isActive: link.class.isActive,
      }));
  }

  // 2. Fallback to legacy classType-based filtering (temporary during migration)
  const legacyTypes = await db.offerAllowedClassType.findMany({
    where: { offerId },
  });

  if (legacyTypes.length === 0) {
    // No direct links AND no legacy types = ZERO classes allowed
    return [];
  }

  // Log legacy fallback usage for monitoring
  if (logLegacyFallback) {
    console.warn("[CLASS_ELIGIBILITY] Legacy fallback used for offer", {
      offerId,
      legacyTypes: legacyTypes.map((t) => t.classType),
      timestamp: new Date().toISOString(),
    });
  }

  // Find classes matching legacy types
  const classTypes = legacyTypes.map((t) => t.classType.toLowerCase().trim());
  const classes = await db.class.findMany({
    where: {
      type: {
        in: classTypes,
      },
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      trainer: { select: { name: true } },
    },
  });

  return classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    type: cls.type,
    trainer: cls.trainer.name,
    isActive: cls.isActive,
  }));
}

/**
 * Get eligible classes for a Membership or Package
 *
 * Uses classSessions JSON field which contains classId references
 * Empty or null = ZERO classes (NOT all classes)
 */
async function getEligibleClassesForMembershipOrPackage(
  membershipId: string,
  options: { includeInactive?: boolean } = {}
): Promise<EligibleClass[]> {
  const { includeInactive = false } = options;

  const membership = await db.membership.findUnique({
    where: { id: membershipId },
    select: { classSessions: true },
  });

  if (!membership || !membership.classSessions) {
    // No membership or no classSessions = ZERO classes
    return [];
  }

  let sessions: Array<{ classId?: string; classType?: string }> = [];
  try {
    const parsed = JSON.parse(membership.classSessions);
    sessions = Array.isArray(parsed) ? parsed : [];
  } catch {
    // Invalid JSON = ZERO classes
    return [];
  }

  if (sessions.length === 0) {
    // Empty sessions = ZERO classes (NOT all classes)
    return [];
  }

  // Extract classIds from sessions
  const classIds = sessions
    .map((s) => s.classId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (classIds.length === 0) {
    // No valid classIds = ZERO classes
    return [];
  }

  // Fetch the specific classes
  const classes = await db.class.findMany({
    where: {
      id: { in: classIds },
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      trainer: { select: { name: true } },
    },
  });

  return classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    type: cls.type,
    trainer: cls.trainer.name,
    isActive: cls.isActive,
  }));
}

/**
 * Main unified function to get eligible classes for any source
 *
 * @param source - The source (offer, membership, or package) to check
 * @param options - Optional settings
 * @returns Array of eligible classes (empty if none allowed)
 *
 * @example
 * // Get classes for an offer
 * const classes = await getEligibleClassesForSource({
 *   type: 'offer',
 *   id: offerId
 * });
 *
 * @example
 * // Get classes for a membership (including inactive for admin)
 * const classes = await getEligibleClassesForSource({
 *   type: 'membership',
 *   id: membershipId
 * }, { includeInactive: true });
 */
export async function getEligibleClassesForSource(
  source: EligibilitySource,
  options: {
    includeInactive?: boolean;
    logLegacyFallback?: boolean;
  } = {}
): Promise<EligibleClass[]> {
  if (source.type === "offer") {
    return getEligibleClassesForOffer(source.id, options);
  }

  if (source.type === "membership" || source.type === "package") {
    return getEligibleClassesForMembershipOrPackage(source.id, options);
  }

  // Unknown source type = ZERO classes
  console.error("[CLASS_ELIGIBILITY] Unknown source type", {
    source,
    timestamp: new Date().toISOString(),
  });
  return [];
}

/**
 * Check if a specific class is allowed for a source
 *
 * This is faster than getEligibleClassesForSource when you only need
 * to validate one class (used in booking API)
 *
 * @param source - The source to check
 * @param classId - The class ID to validate
 * @returns true if class is allowed, false otherwise
 */
export async function isClassAllowedForSource(
  source: EligibilitySource,
  classId: string
): Promise<boolean> {
  if (source.type === "offer") {
    // Check direct link first
    const directLink = await db.offerAllowedClass.findFirst({
      where: {
        offerId: source.id,
        classId,
      },
    });

    if (directLink) return true;

    // Fallback to legacy type-based check
    const gymClass = await db.class.findUnique({
      where: { id: classId },
      select: { type: true },
    });

    if (!gymClass) return false;

    const legacyTypes = await db.offerAllowedClassType.findMany({
      where: { offerId: source.id },
    });

    if (legacyTypes.length === 0) {
      // No direct links AND no legacy types = NOT allowed
      return false;
    }

    const allowedTypes = legacyTypes.map((t) =>
      t.classType.toLowerCase().trim()
    );
    const isAllowed = allowedTypes.includes(gymClass.type.toLowerCase().trim());

    if (isAllowed) {
      console.warn("[CLASS_ELIGIBILITY] Legacy fallback used in validation", {
        offerId: source.id,
        classId,
        classType: gymClass.type,
        timestamp: new Date().toISOString(),
      });
    }

    return isAllowed;
  }

  if (source.type === "membership" || source.type === "package") {
    const membership = await db.membership.findUnique({
      where: { id: source.id },
      select: { classSessions: true },
    });

    if (!membership || !membership.classSessions) return false;

    try {
      const sessions = JSON.parse(membership.classSessions);
      if (!Array.isArray(sessions)) return false;

      return sessions.some((s) => s.classId === classId);
    } catch {
      return false;
    }
  }

  return false;
}
