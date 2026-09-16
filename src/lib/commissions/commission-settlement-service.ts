import type { Prisma } from "@prisma/client";

export const COMMISSION_TYPES = [
  "partner",
  "agent_user",
  "sales_agent",
  "manager",
  "manager_partner",
  "staff",
  "trainer",
  "nutrition",
  "marketing",
] as const;

export type CommissionType = (typeof COMMISSION_TYPES)[number];

export type CommissionSettlementInput = {
  commissionType: CommissionType;
  beneficiaryId: string;
  commissionIds: string[];

  actorUserId?: string | null;

  sourceType?: string | null;
  sourceId?: string | null;

  paymentMethod?: string | null;
  paymentReference?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;

  requestedAt?: Date | null;
  approvedAt?: Date | null;
  paidAt?: Date | null;
};

type LockedCommission = {
  id: string;
  amount: number;
  status: string;
  beneficiaryId: string;
};

type SettlementConfig = {
  table: string;
  openStatus: "pending" | "earned";
  beneficiaryColumn: string;
};

type PayoutWithItems = Prisma.CommissionPayoutGetPayload<{
  include: {
    items: true;
  };
}>;

const CONFIG: Record<CommissionType, SettlementConfig> = {
  partner: {
    table: "PartnerCommission",
    openStatus: "pending",
    beneficiaryColumn: "partnerId",
  },
  agent_user: {
    table: "AgentCommission",
    openStatus: "earned",
    beneficiaryColumn: "agentUserId",
  },
  sales_agent: {
    table: "SalesAgentCommission",
    openStatus: "earned",
    beneficiaryColumn: "agentId",
  },
  manager: {
    table: "ManagerCommission",
    openStatus: "earned",
    beneficiaryColumn: "managerId",
  },
  manager_partner: {
    table: "ManagerPartnerCommission",
    openStatus: "earned",
    beneficiaryColumn: "managerId",
  },
  staff: {
    table: "StaffCommission",
    openStatus: "earned",
    beneficiaryColumn: "staffUserId",
  },
  trainer: {
    table: "TrainerCommission",
    openStatus: "earned",
    beneficiaryColumn: "trainerUserId",
  },
  nutrition: {
    table: "NutritionCommission",
    openStatus: "earned",
    beneficiaryColumn: "nutritionistUserId",
  },

  /*
   * MARKETING_COMMISSION_SETTLEMENT
   *
   * Marketing closing commission is independent from Staff referral
   * commission, but uses the same authoritative payout boundary.
   */
  marketing: {
    table: "MarketingCommission",
    openStatus: "earned",
    beneficiaryColumn: "staffUserId",
  },
};

function cleanOptional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeIds(ids: string[]) {
  const normalized = ids.map((id) => id.trim()).filter(Boolean);

  if (normalized.length === 0) {
    throw new Error("COMMISSION_SETTLEMENT_EMPTY_IDS");
  }

  const unique = [...new Set(normalized)];

  if (unique.length !== normalized.length) {
    throw new Error("COMMISSION_SETTLEMENT_DUPLICATE_IDS");
  }

  return unique.sort();
}

function toCents(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("COMMISSION_SETTLEMENT_INVALID_AMOUNT");
  }

  return Math.round(amount * 100);
}

function fromCents(cents: number) {
  return cents / 100;
}

async function loadPayoutById(
  tx: Prisma.TransactionClient,
  payoutId: string,
): Promise<PayoutWithItems> {
  return tx.commissionPayout.findUniqueOrThrow({
    where: {
      id: payoutId,
    },
    include: {
      items: {
        orderBy: [{ commissionType: "asc" }, { commissionId: "asc" }],
      },
    },
  });
}

/*
 * Current/locking read.
 *
 * This is intentionally not a normal consistent-read lookup. After losing a
 * unique(sourceType, sourceId) race we must observe the committed winner.
 */
async function findSourcePayoutCurrent(
  tx: Prisma.TransactionClient,
  sourceType: string,
  sourceId: string,
): Promise<PayoutWithItems | null> {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT \`id\`
      FROM \`CommissionPayout\`
      WHERE \`sourceType\` = ?
        AND \`sourceId\` = ?
      LIMIT 1
      FOR UPDATE
    `,
    sourceType,
    sourceId,
  );

  const id = rows[0]?.id;

  if (!id) return null;

  return loadPayoutById(tx, String(id));
}

function assertIdempotentSourceMatches(
  existing: PayoutWithItems,
  input: {
    beneficiaryId: string;
    commissionType: CommissionType;
    commissionIds: string[];
  },
) {
  if (existing.status !== "paid") {
    throw new Error("COMMISSION_SETTLEMENT_SOURCE_NOT_FINAL");
  }

  if (
    existing.beneficiaryType !== input.commissionType ||
    existing.beneficiaryId !== input.beneficiaryId
  ) {
    throw new Error("COMMISSION_SETTLEMENT_SOURCE_CONFLICT");
  }

  const expected = input.commissionIds
    .map((id) => `${input.commissionType}:${id}`)
    .sort();

  const actual = existing.items
    .map((item) => `${item.commissionType}:${item.commissionId}`)
    .sort();

  if (
    expected.length !== actual.length ||
    expected.some((value, index) => value !== actual[index])
  ) {
    throw new Error("COMMISSION_SETTLEMENT_SOURCE_CONFLICT");
  }

  return existing;
}

async function reserveSourcePayout(
  tx: Prisma.TransactionClient,
  input: {
    commissionType: CommissionType;
    beneficiaryId: string;
    commissionIds: string[];

    actorUserId?: string | null;

    sourceType: string;
    sourceId: string;

    paymentMethod?: string | null;
    paymentReference?: string | null;
    receiptUrl?: string | null;
    notes?: string | null;

    requestedAt?: Date | null;
    approvedAt?: Date | null;
  },
) {
  /*
   * INSERT IGNORE / skipDuplicates is intentional here.
   *
   * sourceType + sourceId is the unique business-command boundary.
   * Concurrent requests compete at the database without using a uniqueness
   * exception as normal application control flow.
   *
   * count = 1:
   *   this transaction owns the processing reservation.
   *
   * count = 0:
   *   another transaction already owns or completed this source.
   */
  const reservation = await tx.commissionPayout.createMany({
    data: [
      {
        beneficiaryType: input.commissionType,
        beneficiaryId: input.beneficiaryId,

        totalAmount: 0,
        currency: "EGP",
        status: "processing",

        paymentMethod: cleanOptional(input.paymentMethod),
        paymentReference: cleanOptional(input.paymentReference),
        receiptUrl: cleanOptional(input.receiptUrl),
        notes: cleanOptional(input.notes),

        sourceType: input.sourceType,
        sourceId: input.sourceId,

        requestedAt: input.requestedAt ?? null,
        approvedAt: input.approvedAt ?? null,
        paidAt: null,

        createdByUserId: cleanOptional(input.actorUserId),
      },
    ],
    skipDuplicates: true,
  });

  const payout = await findSourcePayoutCurrent(
    tx,
    input.sourceType,
    input.sourceId,
  );

  if (!payout) {
    throw new Error("COMMISSION_SETTLEMENT_SOURCE_RESERVATION_MISSING");
  }

  if (reservation.count === 0) {
    return {
      reservedPayoutId: null,
      existing: assertIdempotentSourceMatches(payout, {
        beneficiaryId: input.beneficiaryId,
        commissionType: input.commissionType,
        commissionIds: input.commissionIds,
      }),
    };
  }

  if (reservation.count !== 1) {
    throw new Error("COMMISSION_SETTLEMENT_SOURCE_RESERVATION_COUNT");
  }

  if (payout.status !== "processing") {
    throw new Error("COMMISSION_SETTLEMENT_SOURCE_RESERVATION_STATE");
  }

  return {
    reservedPayoutId: payout.id,
    existing: null as PayoutWithItems | null,
  };
}

async function lockAndLoad(
  tx: Prisma.TransactionClient,
  type: CommissionType,
  ids: string[],
): Promise<LockedCommission[]> {
  const cfg = CONFIG[type];
  const placeholders = ids.map(() => "?").join(", ");

  const sql = `
    SELECT
      \`id\`,
      \`amount\`,
      \`status\`,
      \`${cfg.beneficiaryColumn}\` AS \`beneficiaryId\`
    FROM \`${cfg.table}\`
    WHERE \`id\` IN (${placeholders})
    ORDER BY \`id\`
    FOR UPDATE
  `;

  const rows = await tx.$queryRawUnsafe<
    Array<{
      id: string;
      amount: number | string;
      status: string;
      beneficiaryId: string;
    }>
  >(sql, ...ids);

  return rows.map((row) => ({
    id: String(row.id),
    amount: Number(row.amount),
    status: String(row.status),
    beneficiaryId: String(row.beneficiaryId),
  }));
}

async function closeCommissionRows(
  tx: Prisma.TransactionClient,
  type: CommissionType,
  ids: string[],
  settledAt: Date,
  payoutId: string,
) {
  switch (type) {
    case "partner":
      return tx.partnerCommission.updateMany({
        where: {
          id: { in: ids },
          status: "pending",
        },
        data: {
          status: "withdrawn",
          withdrawnAt: settledAt,
        },
      });

    case "agent_user":
      return tx.agentCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
        },
        data: {
          status: "settled",
          settledAt,
        },
      });

    case "sales_agent":
      return tx.salesAgentCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
        },
        data: {
          status: "settled",
          settledAt,
        },
      });

    case "manager":
      return tx.managerCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
        },
        data: {
          status: "settled",
          settledAt,
        },
      });

    case "manager_partner":
      return tx.managerPartnerCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
        },
        data: {
          status: "settled",
          settledAt,
        },
      });

    case "staff":
      return tx.staffCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
          settlementOwnerType: null,
          settlementOwnerId: null,
        },
        data: {
          status: "settled",
          settledAt,
          settlementOwnerType: "payout",
          settlementOwnerId: payoutId,
        },
      });

    case "trainer":
      return tx.trainerCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
        },
        data: {
          status: "settled",
          settledAt,
        },
      });

    case "nutrition":
      return tx.nutritionCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
        },
        data: {
          status: "settled",
          settledAt,
        },
      });

    case "marketing":
      return tx.marketingCommission.updateMany({
        where: {
          id: { in: ids },
          status: "earned",
        },
        data: {
          status: "settled",
          settledAt,
        },
      });
  }
}

/**
 * AUTHORITATIVE COMMISSION SETTLEMENT BOUNDARY
 *
 * With sourceType/sourceId:
 *   source reservation is the first serialization boundary.
 *
 * Without a source:
 *   exact commission rows are the serialization boundary.
 *
 * Invariants:
 * - explicit commission IDs only
 * - caller never supplies financial amount
 * - all rows must exist
 * - all rows must belong to one beneficiary
 * - only open rows can transition
 * - payout/items/state transition are one transaction
 * - one commission belongs to one payout only
 * - one business source represents one exact payout only
 * - failed processing reservations cannot survive rollback
 */
export async function settleCommissionsTx(
  tx: Prisma.TransactionClient,
  rawInput: CommissionSettlementInput,
) {
  if (!COMMISSION_TYPES.includes(rawInput.commissionType)) {
    throw new Error("COMMISSION_SETTLEMENT_INVALID_TYPE");
  }

  const beneficiaryId = rawInput.beneficiaryId.trim();

  if (!beneficiaryId) {
    throw new Error("COMMISSION_SETTLEMENT_EMPTY_BENEFICIARY");
  }

  const commissionIds = normalizeIds(rawInput.commissionIds);

  const sourceType = cleanOptional(rawInput.sourceType);
  const sourceId = cleanOptional(rawInput.sourceId);

  if ((sourceType && !sourceId) || (!sourceType && sourceId)) {
    throw new Error("COMMISSION_SETTLEMENT_INCOMPLETE_SOURCE");
  }

  let payoutId: string | null = null;

  /*
   * When the business action has a stable source document, reserve it FIRST.
   * This serializes duplicate deliveries before touching commission rows.
   */
  if (sourceType && sourceId) {
    const reservation = await reserveSourcePayout(tx, {
      commissionType: rawInput.commissionType,
      beneficiaryId,
      commissionIds,

      actorUserId: rawInput.actorUserId,

      sourceType,
      sourceId,

      paymentMethod: rawInput.paymentMethod,
      paymentReference: rawInput.paymentReference,
      receiptUrl: rawInput.receiptUrl,
      notes: rawInput.notes,

      requestedAt: rawInput.requestedAt,
      approvedAt: rawInput.approvedAt,
    });

    if (reservation.existing) {
      return {
        payout: reservation.existing,
        idempotent: true as const,
      };
    }

    payoutId = reservation.reservedPayoutId;
  }

  const cfg = CONFIG[rawInput.commissionType];

  const rows = await lockAndLoad(tx, rawInput.commissionType, commissionIds);

  if (rows.length !== commissionIds.length) {
    throw new Error("COMMISSION_SETTLEMENT_COMMISSION_NOT_FOUND");
  }

  const lockedIds = rows.map((row) => row.id).sort();

  if (lockedIds.some((id, index) => id !== commissionIds[index])) {
    throw new Error("COMMISSION_SETTLEMENT_COMMISSION_NOT_FOUND");
  }

  for (const row of rows) {
    if (row.beneficiaryId !== beneficiaryId) {
      throw new Error("COMMISSION_SETTLEMENT_BENEFICIARY_MISMATCH");
    }

    if (row.status !== cfg.openStatus) {
      throw new Error("COMMISSION_SETTLEMENT_NOT_OPEN");
    }
  }

  const itemAmounts = rows.map((row) => ({
    commissionId: row.id,
    cents: toCents(row.amount),
  }));

  const totalCents = itemAmounts.reduce((sum, item) => sum + item.cents, 0);

  if (totalCents <= 0) {
    throw new Error("COMMISSION_SETTLEMENT_INVALID_TOTAL");
  }

  const settledAt = rawInput.paidAt ?? new Date();

  /*
   * Source-less manual settlements create their payout only after the
   * commission lock. Source-backed settlements already own a reservation.
   */
  if (!payoutId) {
    const payout = await tx.commissionPayout.create({
      data: {
        beneficiaryType: rawInput.commissionType,
        beneficiaryId,

        totalAmount: 0,
        currency: "EGP",
        status: "processing",

        paymentMethod: cleanOptional(rawInput.paymentMethod),
        paymentReference: cleanOptional(rawInput.paymentReference),
        receiptUrl: cleanOptional(rawInput.receiptUrl),
        notes: cleanOptional(rawInput.notes),

        requestedAt: rawInput.requestedAt ?? null,
        approvedAt: rawInput.approvedAt ?? null,
        paidAt: null,

        createdByUserId: cleanOptional(rawInput.actorUserId),
      },
    });

    payoutId = payout.id;
  }

  await tx.commissionPayoutItem.createMany({
    data: itemAmounts.map((item) => ({
      payoutId: payoutId!,
      commissionType: rawInput.commissionType,
      commissionId: item.commissionId,
      amount: fromCents(item.cents),
    })),
  });

  const transition = await closeCommissionRows(
    tx,
    rawInput.commissionType,
    commissionIds,
    settledAt,
    payoutId!,
  );

  if (transition.count !== commissionIds.length) {
    throw new Error("COMMISSION_SETTLEMENT_TRANSITION_MISMATCH");
  }

  const payout = await tx.commissionPayout.update({
    where: {
      id: payoutId,
    },
    data: {
      totalAmount: fromCents(totalCents),
      status: "paid",
      paidAt: settledAt,
    },
    include: {
      items: {
        orderBy: [{ commissionType: "asc" }, { commissionId: "asc" }],
      },
    },
  });

  return {
    payout,
    idempotent: false as const,
  };
}
