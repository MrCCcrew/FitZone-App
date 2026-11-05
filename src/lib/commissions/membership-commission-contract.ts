export type CommissionType = "percentage" | "fixed";

export type CommissionTerms = {
  type: CommissionType;
  rate: number;
  baseAmount: number;
};

export type MembershipCommissionSnapshotV1 = {
  version: 1;
  capturedAt: string;

  partner?: {
    partnerId: string;
    source: "partner_code" | "affiliate_link";
    affiliateToken?: string | null;
    terms: CommissionTerms;
    manager?: {
      managerId: string;
      type: "percentage_of_partner" | "fixed";
      rate: number;
    };
  };

  legacyAgent?: {
    agentUserId: string;
    terms: CommissionTerms;
  };

  salesAgent?: {
    agentId: string;
    referralCode: string;

    // Historical SalesAgentReferral.totalSpent semantics:
    // this is the membership paymentAmount tracked as customer spend,
    // and is intentionally independent from the commission calculation base.
    trackedSpendAmount: number;

    terms: CommissionTerms;
    manager?: {
      managerId: string;
      type:
        | "percentage_of_agents"
        | "percentage_of_revenue"
        | "fixed";
      rate: number;
      revenueBase: number;
    };
  };

  staff?: {
    staffUserId: string;
    referralLinkId: string;
    referralToken: string;
    terms: CommissionTerms;

    // Present only for NEW employee-referral policy snapshots.
    // Absent means historical/legacy commission semantics.
    policy?: {
      classification:
        | "new_customer"
        | "short_term_under_minimum"
        | "short_term"
        | "long_term";

      previousMembershipId: string | null;
      previousMembershipEndDate: string | null;
      gapDays: number | null;

      policyId: string;
      positionId: string;
      positionCode: string;

      rateBps: number;
    };
  };

  trainer?: {
    trainerUserId: string;
    referralLinkId: string;
    referralToken: string;
    terms: CommissionTerms;
  };

  nutrition?: {
    nutritionistUserId: string;
    referralLinkId: string;
    referralToken: string;
    terms: CommissionTerms;
  };
};

function finiteNonNegative(value: number, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid commission snapshot field ${field}: ${value}`);
  }
  return n;
}

export function roundCommissionMoney(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

export function normalizeCommissionTerms(
  terms: CommissionTerms,
): CommissionTerms {
  if (terms.type !== "percentage" && terms.type !== "fixed") {
    throw new Error(`Invalid commission type: ${String(terms.type)}`);
  }

  return {
    type: terms.type,
    rate: finiteNonNegative(terms.rate, "rate"),
    baseAmount: finiteNonNegative(terms.baseAmount, "baseAmount"),
  };
}

export function calculateCommission(terms: CommissionTerms): number {
  const normalized = normalizeCommissionTerms(terms);

  const raw =
    normalized.type === "fixed"
      ? normalized.rate
      : (normalized.baseAmount * normalized.rate) / 100;

  return Math.max(0, roundCommissionMoney(raw));
}

export function serializeMembershipCommissionSnapshot(
  snapshot: MembershipCommissionSnapshotV1,
): string {
  if (snapshot.version !== 1) {
    throw new Error(`Unsupported commission snapshot version: ${snapshot.version}`);
  }

  // Validate every economic component before freezing it.
  if (snapshot.partner) {
    snapshot.partner.terms = normalizeCommissionTerms(snapshot.partner.terms);
    if (snapshot.partner.manager) {
      snapshot.partner.manager.rate = finiteNonNegative(
        snapshot.partner.manager.rate,
        "partner.manager.rate",
      );
    }
  }

  if (snapshot.legacyAgent) {
    snapshot.legacyAgent.terms = normalizeCommissionTerms(
      snapshot.legacyAgent.terms,
    );
  }

  if (snapshot.salesAgent) {
    snapshot.salesAgent.terms = normalizeCommissionTerms(
      snapshot.salesAgent.terms,
    );

    snapshot.salesAgent.trackedSpendAmount = finiteNonNegative(
      snapshot.salesAgent.trackedSpendAmount,
      "salesAgent.trackedSpendAmount",
    );

    if (snapshot.salesAgent.manager) {
      snapshot.salesAgent.manager.rate = finiteNonNegative(
        snapshot.salesAgent.manager.rate,
        "salesAgent.manager.rate",
      );
      snapshot.salesAgent.manager.revenueBase = finiteNonNegative(
        snapshot.salesAgent.manager.revenueBase,
        "salesAgent.manager.revenueBase",
      );
    }
  }

  if (snapshot.staff) {
    snapshot.staff.terms = normalizeCommissionTerms(snapshot.staff.terms);
  }

  if (snapshot.trainer) {
    snapshot.trainer.terms = normalizeCommissionTerms(snapshot.trainer.terms);
  }

  if (snapshot.nutrition) {
    snapshot.nutrition.terms = normalizeCommissionTerms(
      snapshot.nutrition.terms,
    );
  }

  return JSON.stringify(snapshot);
}

export function parseMembershipCommissionSnapshot(
  raw: string,
): MembershipCommissionSnapshotV1 {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid commissionSnapshot JSON");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { version?: unknown }).version !== 1
  ) {
    throw new Error("Unsupported or missing commissionSnapshot version");
  }

  // Re-serialize through validation to guarantee malformed persisted snapshots fail.
  const snapshot = parsed as MembershipCommissionSnapshotV1;
  serializeMembershipCommissionSnapshot(snapshot);

  return snapshot;
}
