export type CustomerLifecycleStatus =
  | "active"
  | "suspended"
  | "pending_payment"
  | "cancelled"
  | "expired"
  | "unsubscribed";

export type CustomerLifecycleMembership = {
  status: string;
  startDate: Date;
  endDate: Date;
  pendingExpiresAt?: Date | null;

  /**
   * New authoritative first-activation marker.
   * Null is expected for legacy rows and unpaid checkout attempts.
   */
  activatedAt?: Date | null;

  /**
   * Historical evidence used only for legacy memberships created before
   * activatedAt existed.
   *
   * Examples:
   * - confirmed paid PaymentTransaction
   * - membership AttendancePass
   * - membership AttendanceCheckIn
   *
   * It must NEVER be inferred merely from paymentMethod being populated.
   */
  legacyActivationEvidence?: boolean;
};

export type CustomerLifecycleInput = {
  suspendedAt?: Date | null;
  memberships: CustomerLifecycleMembership[];
  now?: Date;
};

export function wasMembershipEverActivated(
  membership: CustomerLifecycleMembership,
): boolean {
  /*
   * status=active is itself definitive evidence that the membership has
   * already crossed the activation boundary.
   *
   * For historical expired/cancelled memberships, activatedAt or explicit
   * legacy evidence is required. This deliberately prevents an unpaid
   * Paymob checkout that later became cancelled from being treated as a
   * former real subscription.
   */
  return (
    membership.status === "active" ||
    membership.activatedAt != null ||
    membership.legacyActivationEvidence === true
  );
}

export function classifyCustomerLifecycle(
  input: CustomerLifecycleInput,
): CustomerLifecycleStatus {
  const now = input.now ?? new Date();

  // Administrative suspension is explicit customer-level state only.
  if (input.suspendedAt != null) {
    return "suspended";
  }

  const activeMembership = input.memberships.some(
    (membership) =>
      membership.status === "active" &&
      membership.endDate.getTime() >= now.getTime(),
  );

  if (activeMembership) {
    return "active";
  }

  /*
   * A live checkout inside the existing payment window is the customer's
   * current lifecycle state when there is no currently-active membership.
   *
   * Historical activated memberships remain preserved. If this pending
   * checkout later expires or is cancelled without activation, it is ignored
   * and the customer's real historical state becomes authoritative again.
   */
  const hasLivePending = input.memberships.some(
    (membership) =>
      membership.status === "pending_payment" &&
      membership.pendingExpiresAt != null &&
      membership.pendingExpiresAt.getTime() > now.getTime(),
  );

  if (hasLivePending) {
    return "pending_payment";
  }

  const activatedMemberships = input.memberships
    .filter(wasMembershipEverActivated)
    .sort((a, b) => {
      const aTime =
        a.activatedAt?.getTime() ??
        a.startDate.getTime();

      const bTime =
        b.activatedAt?.getTime() ??
        b.startDate.getTime();

      return bTime - aTime;
    });

  if (activatedMemberships.length === 0) {
    return "unsubscribed";
  }

  const latestRealMembership = activatedMemberships[0];

  if (latestRealMembership.status === "cancelled") {
    return "cancelled";
  }

  /*
   * Historical active rows whose contractual endDate already passed are
   * presented as expired, while the existing membership lifecycle worker
   * remains solely responsible for the actual DB status transition.
   */
  if (
    latestRealMembership.status === "expired" ||
    (latestRealMembership.status === "active" &&
      latestRealMembership.endDate.getTime() < now.getTime())
  ) {
    return "expired";
  }

  // Conservative fallback for any legacy/unexpected historical state.
  return "expired";
}
