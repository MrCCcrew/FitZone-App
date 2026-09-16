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

export type SourceType = "offer" | "membership" | "package" | "trial";

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

type TrialClassRule = {
  trialEnabled?: boolean;
  trialPrice?: number;
};

function parseTrialClassesConfig(
  content: string | null | undefined,
): Record<string, TrialClassRule> {
  if (!content) return {};

  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, TrialClassRule>
      : {};
  } catch {
    return {};
  }
}

async function getTrialClassRules(client: any = db) {
  const record = await client.siteContent.findUnique({
    where: { section: "trial_classes_config" },
    select: { content: true },
  });

  return parseTrialClassesConfig(record?.content);
}

async function getTrialEligibilitySnapshot(
  client: any = db,
): Promise<EligibilityPolicySnapshot> {
  const rules = await getTrialClassRules(client);

  const classes = await client.class.findMany({
    select: { id: true },
  });

  const classIds = classes
    .map((gymClass: { id: string }) => gymClass.id)
    .filter((classId: string) => {
      const rule = rules[classId];
      return (
        rule?.trialEnabled === true &&
        Number.isFinite(Number(rule.trialPrice)) &&
        Number(rule.trialPrice) > 0
      );
    })
    .sort();

  return {
    mode: "class_ids",
    classIds,
    classTypes: [],
  };
}

/**
 * Get eligible classes for an Offer.
 *
 * Exact OfferAllowedClass links are authoritative for all new offer
 * configurations, including special offers. OfferAllowedClassType is a legacy
 * compatibility fallback only when no exact links exist.
 * Empty = ZERO classes (NOT all classes).
 */
async function getEligibleClassesForOffer(
  offerId: string,
  options: OfferClassEligibilityOptions = {},
): Promise<EligibleClass[]> {
  const { includeInactive = false, logLegacyFallback = true } = options;

  const offer = await db.offer.findUnique({
    where: { id: offerId },
    select: { id: true },
  });
  if (!offer) return [];

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

  const legacyTypes = await db.offerAllowedClassType.findMany({
    where: { offerId },
  });
  if (legacyTypes.length === 0) return [];

  if (logLegacyFallback) {
    console.warn("[CLASS_ELIGIBILITY] Legacy offer type fallback used", {
      offerId,
      legacyTypes: legacyTypes.map((row) => row.classType),
      timestamp: new Date().toISOString(),
    });
  }

  const stableTypeIds = [
    ...new Set(
      legacyTypes
        .map((row) => row.classTypeId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const fallbackTypes = [
    ...new Set(
      legacyTypes
        .filter((row) => !row.classTypeId)
        .map((row) => row.classType.toLowerCase().trim()),
    ),
  ];

  const classes = await db.class.findMany({
    where: {
      OR: [
        ...(stableTypeIds.length > 0
          ? [{ classTypeId: { in: stableTypeIds } }]
          : []),
        ...(fallbackTypes.length > 0
          ? [{ type: { in: fallbackTypes } }]
          : []),
      ],
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

function buildEligibilityPolicy(
  classIds: string[],
  classTypeIds: string[],
  classTypes: string[],
): EligibilityPolicySnapshot {
  const ids = [...new Set(classIds.map((v) => v.trim()).filter(Boolean))].sort();
  const typeIds = [...new Set(classTypeIds.map((v) => v.trim()).filter(Boolean))].sort();
  const types = normalizeEligibilityValues(classTypes);

  const buckets =
    Number(ids.length > 0) +
    Number(typeIds.length > 0) +
    Number(types.length > 0);

  if (buckets > 1) {
    return {
      mode: "mixed",
      classIds: ids,
      classTypeIds: typeIds,
      classTypes: types,
    };
  }

  if (ids.length > 0) {
    return { mode: "class_ids", classIds: ids, classTypes: [] };
  }

  if (typeIds.length > 0) {
    return {
      mode: "class_type_ids",
      classIds: [],
      classTypes: [],
      classTypeIds: typeIds,
    };
  }

  if (types.length > 0) {
    return { mode: "class_types", classIds: [], classTypes: types };
  }

  return { mode: "class_ids", classIds: [], classTypes: [] };
}

/**
 * Resolve Membership/Package configuration into ONE canonical entitlement
 * policy.
 *
 * Compatibility rules:
 * - current Class.id => exact class entitlement
 * - classTypeId => stable class-type entitlement
 * - stale historical classId + preserved classType => class-type entitlement
 * - historical textual value stored inside classId => class-type entitlement
 *
 * This resolver does NOT mutate historical rows.
 */
async function resolveMembershipOrPackageEligibilityPolicy(
  membershipId: string,
  client: any = db,
): Promise<EligibilityPolicySnapshot> {
  const membership = await client.membership.findUnique({
    where: { id: membershipId },
    select: { classSessions: true },
  });

  if (!membership?.classSessions) {
    return { mode: "class_ids", classIds: [], classTypes: [] };
  }

  let entries: Array<{
    classId?: unknown;
    classTypeId?: unknown;
    classType?: unknown;
  }> = [];

  try {
    const parsed = JSON.parse(membership.classSessions);
    if (!Array.isArray(parsed)) {
      return { mode: "class_ids", classIds: [], classTypes: [] };
    }
    entries = parsed;
  } catch {
    return { mode: "class_ids", classIds: [], classTypes: [] };
  }

  if (entries.length === 0) {
    return { mode: "class_ids", classIds: [], classTypes: [] };
  }

  const rawClassIds = [
    ...new Set(
      entries
        .map((entry) =>
          typeof entry?.classId === "string" ? entry.classId.trim() : "",
        )
        .filter(Boolean),
    ),
  ];

  const exactRows =
    rawClassIds.length > 0
      ? await client.class.findMany({
          where: { id: { in: rawClassIds } },
          select: { id: true },
        })
      : [];

  const exactIdSet = new Set<string>(
    exactRows.map((row: { id: string }) => row.id),
  );

  const rawTypeIds = [
    ...new Set(
      entries
        .map((entry) =>
          typeof entry?.classTypeId === "string"
            ? entry.classTypeId.trim()
            : "",
        )
        .filter(Boolean),
    ),
  ];

  const validTypeRows =
    rawTypeIds.length > 0
      ? await client.classType.findMany({
          where: { id: { in: rawTypeIds } },
          select: { id: true },
        })
      : [];

  const validTypeIdSet = new Set<string>(
    validTypeRows.map((row: { id: string }) => row.id),
  );

  const classIds: string[] = [];
  const classTypeIds: string[] = [];
  const unresolvedTypes: string[] = [];

  for (const entry of entries) {
    const classId =
      typeof entry?.classId === "string" ? entry.classId.trim() : "";
    const classTypeId =
      typeof entry?.classTypeId === "string"
        ? entry.classTypeId.trim()
        : "";
    const classType =
      typeof entry?.classType === "string" ? entry.classType.trim() : "";

    // Exact class configuration always wins for that entry.
    if (classId && exactIdSet.has(classId)) {
      classIds.push(classId);
      continue;
    }

    // Stable class-type configuration is the preferred package contract.
    if (classTypeId && validTypeIdSet.has(classTypeId)) {
      classTypeIds.push(classTypeId);
      continue;
    }

    // Legacy/stale class IDs use their preserved semantic type when available.
    const legacyType = classType || classId;
    if (legacyType) {
      unresolvedTypes.push(legacyType);
    }
  }

  /*
   * Upgrade legacy textual semantics in-memory to stable ClassType IDs when
   * current classes provide an unambiguous type mapping.
   *
   * No database backfill is performed here.
   */
  const normalizedLegacyTypes = normalizeEligibilityValues(unresolvedTypes);

  if (normalizedLegacyTypes.length > 0) {
    const currentTypeRows = await client.class.findMany({
      select: { type: true, classTypeId: true },
    });

    const aliasRows = await client.classTypeAlias.findMany({
      where: { alias: { in: normalizedLegacyTypes } },
      select: { alias: true, classTypeId: true },
    });

    const mapped = new Set<string>();
    const stillTextual: string[] = [];

    for (const legacyType of normalizedLegacyTypes) {
      const matchingTypeIds = new Set<string>();

      for (const row of currentTypeRows as Array<{
        type: string;
        classTypeId: string | null;
      }>) {
        if (
          row.type.trim().toLowerCase() === legacyType &&
          row.classTypeId
        ) {
          matchingTypeIds.add(row.classTypeId);
        }
      }

      for (const row of aliasRows as Array<{
        alias: string;
        classTypeId: string;
      }>) {
        if (row.alias.trim().toLowerCase() === legacyType) {
          matchingTypeIds.add(row.classTypeId);
        }
      }

      // Promote legacy text only when it resolves to exactly ONE stable type.
      // Ambiguous/unresolved text remains textual to avoid widening entitlement.
      if (matchingTypeIds.size === 1) {
        mapped.add([...matchingTypeIds][0]);
      } else {
        stillTextual.push(legacyType);
      }
    }

    mapped.forEach((id) => classTypeIds.push(id));

    return buildEligibilityPolicy(
      classIds,
      classTypeIds,
      stillTextual,
    );
  }

  return buildEligibilityPolicy(classIds, classTypeIds, []);
}

/**
 * Get eligible classes for a Membership or Package.
 *
 * All membership/package paths consume the exact same resolved policy.
 */
async function getEligibleClassesForMembershipOrPackage(
  membershipId: string,
  options: { includeInactive?: boolean } = {},
): Promise<EligibleClass[]> {
  const { includeInactive = false } = options;

  const policy =
    await resolveMembershipOrPackageEligibilityPolicy(membershipId);

  const classIds =
    policy.mode === "class_ids" || policy.mode === "mixed"
      ? policy.classIds
      : [];

  const classTypeIds =
    policy.mode === "class_type_ids" || policy.mode === "mixed"
      ? policy.classTypeIds
      : [];

  const classTypes =
    policy.mode === "class_types" || policy.mode === "mixed"
      ? policy.classTypes
      : [];

  const eligibilityOr: Array<Record<string, unknown>> = [];

  if (classIds.length > 0) {
    eligibilityOr.push({ id: { in: classIds } });
  }

  if (classTypeIds.length > 0) {
    eligibilityOr.push({ classTypeId: { in: classTypeIds } });
  }

  if (classTypes.length > 0) {
    eligibilityOr.push({ type: { in: classTypes } });
  }

  if (eligibilityOr.length === 0) return [];

  const classes = await db.class.findMany({
    where: {
      OR: eligibilityOr,
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

  if (source.type === "trial") {
    const snapshot = await getTrialEligibilitySnapshot(db);

    if (snapshot.classIds.length === 0) return [];

    const classes = await db.class.findMany({
      where: {
        id: { in: snapshot.classIds },
        ...(options.includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        name: true,
        type: true,
        trainer: {
          select: {
            name: true,
          },
        },
        isActive: true,
      },
    });

    return classes.map((gymClass) => ({
      id: gymClass.id,
      name: gymClass.name,
      type: gymClass.type,
      trainer: gymClass.trainer?.name ?? "",
      isActive: gymClass.isActive,
    }));
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
  if (source.type === "trial") {
    const rules = await getTrialClassRules(db);

    const gymClass = await db.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!gymClass) return false;

    return rules[classId]?.trialEnabled !== false;
  }

  if (source.type === "offer") {
    const directLink = await db.offerAllowedClass.findFirst({
      where: { offerId: source.id, classId },
      select: { id: true },
    });
    if (directLink) return true;

    const gymClass = await db.class.findUnique({
      where: { id: classId },
      select: { type: true, classTypeId: true },
    });
    if (!gymClass) return false;

    const legacyTypes = await db.offerAllowedClassType.findMany({
      where: { offerId: source.id },
    });
    if (legacyTypes.length === 0) return false;

    if (
      gymClass.classTypeId &&
      legacyTypes.some((row) => row.classTypeId === gymClass.classTypeId)
    ) {
      return true;
    }

    return legacyTypes
      .filter((row) => !row.classTypeId)
      .some(
        (row) =>
          row.classType.toLowerCase().trim() ===
          gymClass.type.toLowerCase().trim(),
      );
  }

  if (source.type === "membership" || source.type === "package") {
    const policy =
      await resolveMembershipOrPackageEligibilityPolicy(source.id);

    return isClassAllowedByEligibilitySnapshot(policy, classId);
  }

  return false;
}

export type EligibilityPolicySnapshot =
  | {
      mode: "class_ids";
      classIds: string[];
      classTypes: [];
      classTypeIds?: [];
    }
  | {
      mode: "class_type_ids";
      classIds: [];
      classTypes: [];
      classTypeIds: string[];
    }
  | {
      mode: "class_types";
      classIds: [];
      classTypes: string[];
      classTypeIds?: [];
    }
  | {
      mode: "mixed";
      classIds: string[];
      classTypes: string[];
      classTypeIds: string[];
    };

function normalizeEligibilityValues(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].sort();
}

export function parseEligibilityPolicySnapshot(
  value: string | null | undefined,
): EligibilityPolicySnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<EligibilityPolicySnapshot>;
    if (!parsed || typeof parsed !== "object") return null;

    if (
      parsed.mode === "mixed" &&
      Array.isArray(parsed.classIds) &&
      Array.isArray(parsed.classTypeIds) &&
      Array.isArray(parsed.classTypes)
    ) {
      return {
        mode: "mixed",
        classIds: [
          ...new Set(
            parsed.classIds
              .filter((id): id is string => typeof id === "string" && id.trim() !== "")
              .map((id) => id.trim()),
          ),
        ].sort(),
        classTypeIds: [
          ...new Set(
            parsed.classTypeIds
              .filter((id): id is string => typeof id === "string" && id.trim() !== "")
              .map((id) => id.trim()),
          ),
        ].sort(),
        classTypes: normalizeEligibilityValues(
          parsed.classTypes.filter(
            (value): value is string => typeof value === "string",
          ),
        ),
      };
    }

    if (parsed.mode === "class_ids" && Array.isArray(parsed.classIds)) {
      return {
        mode: "class_ids",
        classIds: [...new Set(parsed.classIds.filter((id): id is string => typeof id === "string" && id.trim() !== "").map((id) => id.trim()))].sort(),
        classTypes: [],
      };
    }

    if (parsed.mode === "class_type_ids" && Array.isArray(parsed.classTypeIds)) {
      return {
        mode: "class_type_ids",
        classIds: [],
        classTypes: [],
        classTypeIds: [...new Set(parsed.classTypeIds.filter((id): id is string => typeof id === "string" && id.trim() !== "").map((id) => id.trim()))].sort(),
      };
    }

    if (parsed.mode === "class_types" && Array.isArray(parsed.classTypes)) {
      return {
        mode: "class_types",
        classIds: [],
        classTypes: normalizeEligibilityValues(
          parsed.classTypes.filter((value): value is string => typeof value === "string"),
        ),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Freeze the exact entitlement semantics of a purchase source.
 *
 * New purchases use exact Class IDs whenever the source has exact class links.
 * Text/type snapshots are retained only as a compatibility fallback for legacy
 * offer configurations that have not yet been migrated to OfferAllowedClass.
 */
export async function getEligibilityPolicySnapshotForSource(
  source: EligibilitySource,
  client: any = db,
): Promise<EligibilityPolicySnapshot> {
  if (source.type === "trial") {
    return getTrialEligibilitySnapshot(client);
  }

  if (source.type === "offer") {
    const offer = await client.offer.findUnique({
      where: { id: source.id },
      select: { id: true },
    });

    if (!offer) {
      return { mode: "class_ids", classIds: [], classTypes: [] };
    }

    const directLinks = await client.offerAllowedClass.findMany({
      where: { offerId: source.id },
      select: { classId: true },
    });

    if (directLinks.length > 0) {
      return {
        mode: "class_ids",
        classIds: [
          ...new Set<string>(
            directLinks
              .map((row: { classId: string }) => row.classId.trim())
              .filter((id: string) => id.length > 0),
          ),
        ].sort(),
        classTypes: [],
      };
    }

    // Legacy offer configuration only. Do not convert these values into new
    // ClassType-based entitlements; preserve their historical text semantics
    // until the admin configuration itself is migrated to exact Class IDs.
    const legacyTypes = await client.offerAllowedClassType.findMany({
      where: { offerId: source.id },
      select: { classType: true },
    });

    return {
      mode: "class_types",
      classIds: [],
      classTypes: normalizeEligibilityValues(
        legacyTypes.map((row: { classType: string }) => row.classType),
      ),
    };
  }

  if (source.type === "membership" || source.type === "package") {
    return resolveMembershipOrPackageEligibilityPolicy(source.id, client);
  }

  return { mode: "class_ids", classIds: [], classTypes: [] };
}

/**
 * Validate a class against a previously frozen purchase-time entitlement.
 */
export async function isClassAllowedByEligibilitySnapshot(
  snapshot: EligibilityPolicySnapshot,
  classId: string,
  client: any = db,
): Promise<boolean> {
  if (snapshot.mode === "class_ids") {
    return snapshot.classIds.includes(classId);
  }

  if (
    snapshot.mode === "mixed" &&
    snapshot.classIds.includes(classId)
  ) {
    return true;
  }

  const gymClass = await client.class.findUnique({
    where: { id: classId },
    select: { type: true, classTypeId: true },
  });

  if (!gymClass) return false;

  if (
    (snapshot.mode === "class_type_ids" || snapshot.mode === "mixed") &&
    gymClass.classTypeId &&
    snapshot.classTypeIds.includes(gymClass.classTypeId)
  ) {
    return true;
  }

  if (snapshot.mode === "class_type_ids") {
    return false;
  }

  // Legacy textual snapshot: resolve historical labels through aliases first.
  if (gymClass.classTypeId && snapshot.classTypes.length > 0) {
    const aliases = await client.classTypeAlias.findMany({
      where: {
        alias: { in: snapshot.classTypes },
      },
      select: { classTypeId: true },
    });

    if (
      aliases.some(
        (alias: { classTypeId: string }) =>
          alias.classTypeId === gymClass.classTypeId,
      )
    ) {
      return true;
    }
  }

  // Final fallback preserves pre-migration exact text semantics.
  return snapshot.classTypes.includes(
    gymClass.type.trim().toLowerCase(),
  );
}
