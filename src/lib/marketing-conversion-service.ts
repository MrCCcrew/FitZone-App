import { Prisma } from "@prisma/client";
import { asDbTransactionClient, db } from "@/lib/db";

export class MarketingConversionError extends Error {
  constructor(
    public code:
      | "CUSTOMER_NOT_FOUND"
      | "STAFF_NOT_FOUND"
      | "ACTIVE_CONVERSION_EXISTS"
      | "CONVERSION_NOT_FOUND"
      | "CONVERSION_LOCKED",
  ) {
    super(code);
  }
}

async function validateCustomer(customerId: string) {
  const customer = await db.user.findFirst({
    where: {
      id: customerId,
      role: "member",
    },
    select: { id: true },
  });

  if (!customer) {
    throw new MarketingConversionError("CUSTOMER_NOT_FOUND");
  }
}

async function validateMarketingStaff(staffUserId: string) {
  const staff = await db.user.findFirst({
    where: {
      id: staffUserId,
      role: "staff",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!staff) {
    throw new MarketingConversionError("STAFF_NOT_FOUND");
  }

  return staff;
}

export async function assignMarketingConversion(input: {
  customerId: string;
  assignedStaffUserId: string;
  createdByUserId: string;
  notes?: string | null;
}) {
  await validateCustomer(input.customerId);
  await validateMarketingStaff(input.assignedStaffUserId);

  try {
    return await db.marketingConversion.create({
      data: {
        customerId: input.customerId,
        assignedStaffUserId: input.assignedStaffUserId,

        status: "open",

        // Unique active lock:
        // one active conversion per customer.
        activeKey: input.customerId,

        createdByUserId: input.createdByUserId,
        notes: input.notes?.trim() || null,
      },
      include: {
        assignedStaff: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MarketingConversionError("ACTIVE_CONVERSION_EXISTS");
    }

    throw error;
  }
}

export async function reassignMarketingConversion(input: {
  conversionId: string;
  assignedStaffUserId: string;
}) {
  await validateMarketingStaff(input.assignedStaffUserId);

  return db.$transaction(async (tx) => {
    const current = await tx.marketingConversion.findUnique({
      where: { id: input.conversionId },
      select: {
        id: true,
        status: true,
        activeKey: true,
      },
    });

    if (!current || !current.activeKey) {
      throw new MarketingConversionError("CONVERSION_NOT_FOUND");
    }

    // Once checkout has frozen this conversion, attribution becomes immutable.
    if (current.status !== "open") {
      throw new MarketingConversionError("CONVERSION_LOCKED");
    }

    return tx.marketingConversion.update({
      where: { id: current.id },
      data: {
        assignedStaffUserId: input.assignedStaffUserId,
        assignedAt: new Date(),
      },
      include: {
        assignedStaff: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}

export async function cancelMarketingConversion(input: {
  conversionId: string;
}) {
  return db.$transaction(async (tx) => {
    const current = await tx.marketingConversion.findUnique({
      where: { id: input.conversionId },
      select: {
        id: true,
        status: true,
        activeKey: true,
      },
    });

    if (!current || !current.activeKey) {
      throw new MarketingConversionError("CONVERSION_NOT_FOUND");
    }

    if (current.status !== "open") {
      throw new MarketingConversionError("CONVERSION_LOCKED");
    }

    return tx.marketingConversion.update({
      where: { id: current.id },
      data: {
        status: "cancelled",
        activeKey: null,
        cancelledAt: new Date(),
      },
    });
  });
}


/* MARKETING_PHASE3_TRANSACTIONAL_LIFECYCLE */

type MarketingTx = Prisma.TransactionClient;

function normalizeMarketingCommissionTerms(input: {
  commissionType: string;
  commissionRate: number;
  commissionBase: number;
}) {
  const commissionType = String(input.commissionType ?? "")
    .trim()
    .toLowerCase();

  if (commissionType !== "percentage" && commissionType !== "fixed") {
    throw new Error(
      `INVALID_MARKETING_COMMISSION_TYPE:${input.commissionType}`,
    );
  }

  const commissionRate = Number(input.commissionRate);
  const commissionBase = Number(input.commissionBase);

  if (!Number.isFinite(commissionRate) || commissionRate < 0) {
    throw new Error("INVALID_MARKETING_COMMISSION_RATE");
  }

  if (!Number.isFinite(commissionBase) || commissionBase < 0) {
    throw new Error("INVALID_MARKETING_COMMISSION_BASE");
  }

  return {
    commissionType,
    commissionRate,
    commissionBase,
  };
}

function calculateMarketingCommission(input: {
  commissionType: string;
  commissionRate: number;
  commissionBase: number;
}) {
  const terms = normalizeMarketingCommissionTerms(input);

  const rawAmount =
    terms.commissionType === "fixed"
      ? terms.commissionRate
      : (terms.commissionBase * terms.commissionRate) / 100;

  return Math.round(rawAmount * 100) / 100;
}

/**
 * Freeze the marketing closer attribution and economics for this purchase.
 *
 * Important:
 * - only an OPEN conversion can be claimed
 * - attribution becomes immutable after this point
 * - current staff commission configuration is read only here
 * - original referral attribution is completely independent
 */
export async function lockMarketingConversionForCheckoutTx(
  tx: MarketingTx,
  input: {
    customerId: string;
    userMembershipId: string;
    commissionBase: number;
  },
) {
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT \`id\`
    FROM \`MarketingConversion\`
    WHERE
      \`customerId\` = ${input.customerId}
      AND \`activeKey\` = ${input.customerId}
      AND \`status\` = 'open'
    LIMIT 1
    FOR UPDATE
  `;

  if (lockedRows.length === 0) {
    return {
      locked: false as const,
      reason: "no_open_conversion" as const,
    };
  }

  const conversion = await tx.marketingConversion.findUnique({
    where: { id: lockedRows[0].id },
    select: {
      id: true,
      customerId: true,
      status: true,
      activeKey: true,
      userMembershipId: true,
      assignedStaffUserId: true,
      assignedStaff: {
        select: {
          marketingCommissionRate: true,
          marketingCommissionType: true,
        },
      },
    },
  });

  if (
    !conversion ||
    conversion.status !== "open" ||
    conversion.activeKey !== input.customerId ||
    conversion.userMembershipId !== null
  ) {
    return {
      locked: false as const,
      reason: "conversion_changed" as const,
    };
  }

  const terms = normalizeMarketingCommissionTerms({
    commissionType: conversion.assignedStaff.marketingCommissionType,
    commissionRate: conversion.assignedStaff.marketingCommissionRate,
    commissionBase: input.commissionBase,
  });

  const claimed = await tx.marketingConversion.updateMany({
    where: {
      id: conversion.id,
      status: "open",
      activeKey: input.customerId,
      userMembershipId: null,
    },
    data: {
      status: "checkout_locked",
      userMembershipId: input.userMembershipId,
      checkoutLockedAt: new Date(),

      commissionTypeSnapshot: terms.commissionType,
      commissionRateSnapshot: terms.commissionRate,
      commissionBaseSnapshot: terms.commissionBase,
    },
  });

  if (claimed.count !== 1) {
    throw new Error(
      `MARKETING_CONVERSION_CHECKOUT_LOCK_FAILED:${conversion.id}`,
    );
  }

  return {
    locked: true as const,
    conversionId: conversion.id,
    assignedStaffUserId: conversion.assignedStaffUserId,
  };
}

/**
 * Earn the frozen marketing commission after the membership has economically
 * finalized.
 *
 * Exact-once protection:
 * - MarketingConversion row lock
 * - MarketingCommission.userMembershipId UNIQUE
 * - MarketingCommission.marketingConversionId UNIQUE
 * - converted state closes the active conversion
 */
export async function accrueMarketingCommissionTx(
  tx: MarketingTx,
  userMembershipId: string,
) {
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT \`id\`
    FROM \`MarketingConversion\`
    WHERE \`userMembershipId\` = ${userMembershipId}
    LIMIT 1
    FOR UPDATE
  `;

  if (lockedRows.length === 0) {
    return {
      alreadyCompleted: false,
      skipped: true,
      reason: "no_marketing_conversion" as const,
    };
  }

  const conversion = await tx.marketingConversion.findUnique({
    where: { id: lockedRows[0].id },
    select: {
      id: true,
      status: true,
      activeKey: true,
      assignedStaffUserId: true,
      userMembershipId: true,
      convertedAt: true,
      commissionTypeSnapshot: true,
      commissionRateSnapshot: true,
      commissionBaseSnapshot: true,
      commission: {
        select: {
          id: true,
          amount: true,
        },
      },
    },
  });

  if (!conversion || conversion.userMembershipId !== userMembershipId) {
    throw new Error(
      `MARKETING_CONVERSION_MEMBERSHIP_MISMATCH:${userMembershipId}`,
    );
  }

  if (conversion.status === "converted") {
    return {
      alreadyCompleted: true,
      skipped: false,
      commissionId: conversion.commission?.id ?? null,
      amount: conversion.commission?.amount ?? 0,
      convertedAt: conversion.convertedAt,
    };
  }

  if (conversion.status !== "checkout_locked") {
    throw new Error(
      `MARKETING_CONVERSION_INVALID_ACCRUAL_STATE:${conversion.id}:${conversion.status}`,
    );
  }

  if (
    conversion.commissionTypeSnapshot == null ||
    conversion.commissionRateSnapshot == null ||
    conversion.commissionBaseSnapshot == null
  ) {
    throw new Error(
      `MARKETING_CONVERSION_SNAPSHOT_MISSING:${conversion.id}`,
    );
  }

  const amount = calculateMarketingCommission({
    commissionType: conversion.commissionTypeSnapshot,
    commissionRate: conversion.commissionRateSnapshot,
    commissionBase: conversion.commissionBaseSnapshot,
  });

  let commissionId: string | null = null;

  if (amount > 0) {
    const commission = await tx.marketingCommission.upsert({
      where: {
        userMembershipId,
      },
      update: {},
      create: {
        marketingConversionId: conversion.id,
        staffUserId: conversion.assignedStaffUserId,
        userMembershipId,
        amount,

        status: "earned",

        commissionTypeSnapshot: conversion.commissionTypeSnapshot,
        commissionRateSnapshot: conversion.commissionRateSnapshot,
        commissionBaseSnapshot: conversion.commissionBaseSnapshot,
      },
      select: {
        id: true,
      },
    });

    commissionId = commission.id;
  }

  const convertedAt = new Date();

  const converted = await tx.marketingConversion.updateMany({
    where: {
      id: conversion.id,
      status: "checkout_locked",
      userMembershipId,
    },
    data: {
      status: "converted",
      activeKey: null,
      convertedAt,
    },
  });

  if (converted.count !== 1) {
    throw new Error(
      `MARKETING_CONVERSION_FINALIZE_FAILED:${conversion.id}`,
    );
  }

  return {
    alreadyCompleted: false,
    skipped: false,
    commissionId,
    amount,
    convertedAt,
  };
}

/**
 * Release an abandoned/expired checkout without losing the marketing lead.
 *
 * The lead becomes OPEN again so the same employee can continue follow-up.
 * This only releases the conversion that owns THIS exact membership.
 */
export async function releaseMarketingCheckoutLockTx(
  tx: MarketingTx,
  userMembershipId: string,
) {
  const conversion = await tx.marketingConversion.findUnique({
    where: {
      userMembershipId,
    },
    select: {
      id: true,
      status: true,
      customerId: true,
      userMembershipId: true,
    },
  });

  if (
    !conversion ||
    conversion.status !== "checkout_locked" ||
    conversion.userMembershipId !== userMembershipId
  ) {
    return {
      released: false as const,
    };
  }

  const released = await tx.marketingConversion.updateMany({
    where: {
      id: conversion.id,
      status: "checkout_locked",
      userMembershipId,
    },
    data: {
      status: "open",
      activeKey: conversion.customerId,

      userMembershipId: null,
      checkoutLockedAt: null,

      commissionTypeSnapshot: null,
      commissionRateSnapshot: null,
      commissionBaseSnapshot: null,
    },
  });

  return {
    released: released.count === 1,
    conversionId: conversion.id,
  };
}

export async function releaseMarketingCheckoutLock(input: {
  userMembershipId: string;
}) {
  return db.$transaction((tx) =>
    releaseMarketingCheckoutLockTx(
      asDbTransactionClient(tx),
      input.userMembershipId,
    ),
  );
}


/* FRIEND_OFFER_MARKETING_TRANSACTIONAL_LIFECYCLE */

export async function lockMarketingConversionForFriendOfferTx(
  tx: MarketingTx,
  input: {
    customerId: string;
    friendOfferParticipantId: string;
    commissionBase: number;
  },
) {
  const participant = await tx.friendOfferParticipant.findUnique({
    where: { id: input.friendOfferParticipantId },
    select: {
      id: true,
      userId: true,
      status: true,
    },
  });

  if (!participant || participant.userId !== input.customerId) {
    throw new Error("MARKETING_FRIEND_PARTICIPANT_MISMATCH");
  }

  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      assignedStaffUserId: string;
      status: string;
    }>
  >`
    SELECT id, assignedStaffUserId, status
    FROM MarketingConversion
    WHERE customerId = ${input.customerId}
      AND activeKey = ${input.customerId}
    LIMIT 1
    FOR UPDATE
  `;

  const conversion = rows[0];

  if (!conversion) {
    return {
      locked: false,
      skipped: true,
      reason: "no_active_conversion" as const,
    };
  }

  if (conversion.status === "checkout_locked") {
    const existing = await tx.marketingConversion.findUnique({
      where: { id: conversion.id },
      select: {
        friendOfferParticipantId: true,
        userMembershipId: true,
      },
    });

    if (
      existing?.friendOfferParticipantId === input.friendOfferParticipantId &&
      existing.userMembershipId === null
    ) {
      return {
        locked: true,
        alreadyLocked: true,
        conversionId: conversion.id,
      };
    }

    throw new Error("MARKETING_CONVERSION_ALREADY_LOCKED");
  }

  if (conversion.status !== "open") {
    throw new Error("MARKETING_CONVERSION_NOT_OPEN");
  }

  const staff = await tx.user.findUnique({
    where: { id: conversion.assignedStaffUserId },
    select: {
      id: true,
      role: true,
      isActive: true,
      marketingCommissionRate: true,
      marketingCommissionType: true,
    },
  });

  if (!staff || staff.role !== "staff" || !staff.isActive) {
    throw new Error("MARKETING_STAFF_INVALID_AT_CHECKOUT");
  }

  const terms = normalizeMarketingCommissionTerms({
    commissionType: staff.marketingCommissionType,
    commissionRate: staff.marketingCommissionRate,
    commissionBase: input.commissionBase,
  });

  const updated = await tx.marketingConversion.updateMany({
    where: {
      id: conversion.id,
      customerId: input.customerId,
      status: "open",
      activeKey: input.customerId,
      userMembershipId: null,
      friendOfferParticipantId: null,
    },
    data: {
      status: "checkout_locked",
      friendOfferParticipantId: input.friendOfferParticipantId,
      checkoutLockedAt: new Date(),
      commissionTypeSnapshot: terms.commissionType,
      commissionRateSnapshot: terms.commissionRate,
      commissionBaseSnapshot: terms.commissionBase,
    },
  });

  if (updated.count !== 1) {
    throw new Error("MARKETING_FRIEND_LOCK_RACE_LOST");
  }

  return {
    locked: true,
    alreadyLocked: false,
    conversionId: conversion.id,
  };
}

export async function bindMarketingFriendOfferToMembershipTx(
  tx: MarketingTx,
  input: {
    friendOfferParticipantId: string;
    userMembershipId: string;
  },
) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      customerId: string;
      status: string;
      userMembershipId: string | null;
    }>
  >`
    SELECT id, customerId, status, userMembershipId
    FROM MarketingConversion
    WHERE friendOfferParticipantId = ${input.friendOfferParticipantId}
    LIMIT 1
    FOR UPDATE
  `;

  const conversion = rows[0];

  if (!conversion) {
    return {
      bound: false,
      skipped: true,
      reason: "no_marketing_conversion" as const,
    };
  }

  const membership = await tx.userMembership.findUnique({
    where: { id: input.userMembershipId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!membership || membership.userId !== conversion.customerId) {
    throw new Error("MARKETING_FRIEND_MEMBERSHIP_CUSTOMER_MISMATCH");
  }

  if (conversion.userMembershipId === input.userMembershipId) {
    return {
      bound: true,
      alreadyBound: true,
      conversionId: conversion.id,
    };
  }

  if (conversion.userMembershipId !== null) {
    throw new Error("MARKETING_FRIEND_ALREADY_BOUND_TO_OTHER_MEMBERSHIP");
  }

  if (conversion.status !== "checkout_locked") {
    throw new Error("MARKETING_FRIEND_CONVERSION_NOT_LOCKED");
  }

  const updated = await tx.marketingConversion.updateMany({
    where: {
      id: conversion.id,
      status: "checkout_locked",
      friendOfferParticipantId: input.friendOfferParticipantId,
      userMembershipId: null,
    },
    data: {
      userMembershipId: input.userMembershipId,
    },
  });

  if (updated.count !== 1) {
    throw new Error("MARKETING_FRIEND_BIND_RACE_LOST");
  }

  return {
    bound: true,
    alreadyBound: false,
    conversionId: conversion.id,
  };
}

export async function releaseMarketingFriendOfferLockTx(
  tx: MarketingTx,
  friendOfferParticipantId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      customerId: string;
      status: string;
      userMembershipId: string | null;
    }>
  >`
    SELECT id, customerId, status, userMembershipId
    FROM MarketingConversion
    WHERE friendOfferParticipantId = ${friendOfferParticipantId}
    LIMIT 1
    FOR UPDATE
  `;

  const conversion = rows[0];

  if (!conversion) {
    return {
      released: false,
      skipped: true,
      reason: "no_marketing_conversion" as const,
    };
  }

  /*
   * Once a real membership has been bound, payment/finalization owns
   * the lifecycle. Never reopen marketing attribution from this path.
   */
  if (conversion.userMembershipId !== null) {
    return {
      released: false,
      skipped: true,
      reason: "membership_already_bound" as const,
    };
  }

  if (conversion.status !== "checkout_locked") {
    return {
      released: false,
      skipped: true,
      reason: "not_checkout_locked" as const,
    };
  }

  const updated = await tx.marketingConversion.updateMany({
    where: {
      id: conversion.id,
      status: "checkout_locked",
      friendOfferParticipantId,
      userMembershipId: null,
    },
    data: {
      status: "open",
      activeKey: conversion.customerId,
      friendOfferParticipantId: null,
      checkoutLockedAt: null,
      commissionTypeSnapshot: null,
      commissionRateSnapshot: null,
      commissionBaseSnapshot: null,
    },
  });

  if (updated.count !== 1) {
    throw new Error("MARKETING_FRIEND_RELEASE_RACE_LOST");
  }

  return {
    released: true,
    conversionId: conversion.id,
  };
}
