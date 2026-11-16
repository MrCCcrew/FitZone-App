export type RenewalMembership = {
  id: string;
  userId: string;
  planName: string;
  kind: string;
  activatedAt: Date | null;
};

export type RenewalPayment = {
  id: string;
  userId: string;
  membershipId: string | null;
  purpose: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  paidAt: Date | null;
};

export type PaidRenewal = {
  userId: string;
  previousMembershipId: string;
  membershipId: string;
  previousPlanName: string;
  planName: string;
  paymentId: string;
  paidAt: Date;
  amount: number;
  currency: string;
  provider: string;
};

export type RenewalAnomaly = {
  membershipId: string;
  reason: "MULTIPLE_PAID_TRANSACTIONS";
  paymentIds: string[];
};

function validDate(value: Date | null): value is Date {
  return value instanceof Date &&
    Number.isFinite(value.getTime());
}

export function calculatePaidMembershipRenewals(
  memberships: RenewalMembership[],
  payments: RenewalPayment[],
): {
  rows: PaidRenewal[];
  anomalies: RenewalAnomaly[];
  totalsByCurrency: Record<string, {
    count: number;
    amount: number;
  }>;
} {
  const byUser = new Map<string, RenewalMembership[]>();

  for (const membership of memberships) {
    if (membership.kind !== "subscription" ||
        !validDate(membership.activatedAt)) continue;

    const group = byUser.get(membership.userId) ?? [];
    group.push(membership);
    byUser.set(membership.userId, group);
  }

  const paymentsByMembership = new Map<string, RenewalPayment[]>();

  for (const payment of payments) {
    if (
      payment.purpose !== "membership" ||
      payment.status !== "paid" ||
      !validDate(payment.paidAt) ||
      !Number.isFinite(payment.amount) ||
      payment.amount <= 0 ||
      !payment.currency ||
      !payment.membershipId
    ) continue;

    const group = paymentsByMembership.get(payment.membershipId) ?? [];
    group.push(payment);
    paymentsByMembership.set(payment.membershipId, group);
  }

  const rows: PaidRenewal[] = [];
  const anomalies: RenewalAnomaly[] = [];

  for (const [userId, history] of byUser) {
    const sorted = [...history].sort((a, b) =>
      a.activatedAt!.getTime() - b.activatedAt!.getTime() ||
      a.id.localeCompare(b.id)
    );

    for (const current of sorted) {
      const previous = [...sorted]
        .filter((candidate) =>
          candidate.id !== current.id &&
          candidate.activatedAt!.getTime() <
            current.activatedAt!.getTime()
        )
        .at(-1);

      if (!previous) continue;

      const evidence = (paymentsByMembership.get(current.id) ?? [])
        .filter((payment) => payment.userId === userId);

      // A second successful charge is a reconciliation issue,
      // not permission to report extra collected renewal revenue.
      if (evidence.length > 1) {
        anomalies.push({
          membershipId: current.id,
          reason: "MULTIPLE_PAID_TRANSACTIONS",
          paymentIds: evidence.map((payment) => payment.id).sort(),
        });
        continue;
      }

      if (evidence.length !== 1) continue;

      const payment = evidence[0];

      rows.push({
        userId,
        previousMembershipId: previous.id,
        membershipId: current.id,
        previousPlanName: previous.planName,
        planName: current.planName,
        paymentId: payment.id,
        paidAt: payment.paidAt!,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
      });
    }
  }

  rows.sort((a, b) =>
    b.paidAt.getTime() - a.paidAt.getTime() ||
    a.membershipId.localeCompare(b.membershipId)
  );

  const totalsByCurrency: Record<string, {
    count: number;
    amount: number;
  }> = {};

  for (const row of rows) {
    const total = totalsByCurrency[row.currency] ??
      { count: 0, amount: 0 };

    total.count += 1;
    total.amount += row.amount;
    totalsByCurrency[row.currency] = total;
  }

  return { rows, anomalies, totalsByCurrency };
}