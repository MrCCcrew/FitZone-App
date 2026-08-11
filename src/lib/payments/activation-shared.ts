/**
 * Shared membership activation logic.
 * Used by both normal payment finalization and recovery flows.
 */

function stringifyJson(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type MembershipData = {
  status: string;
  startDate: Date;
  offerId: string | null;
  membership: {
    name: string;
    nameEn: string | null;
    duration: number;
    walletBonus: number;
    productRewards: string | null;
  };
  offer: { title: string } | null;
};

/**
 * Shared activation helper for both normal payment and recovery flows.
 * Atomically claims payment and activates membership in ONE transaction.
 *
 * CRITICAL: Both normal webhook and verified recovery MUST use this helper
 * to ensure identical activation business logic (duration calculation,
 * late payment handling, race protection, etc.)
 */
export async function activatePaidMembershipTx(
  tx: any,
  transactionId: string,
  membershipId: string
): Promise<{
  success: boolean;
  membershipData: MembershipData | null;
}> {
  const membership = await tx.userMembership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      status: true,
      pendingExpiresAt: true,
      offerId: true,
      snapshotDurationDays: true,
      membership: {
        select: {
          name: true,
          nameEn: true,
          duration: true,
          walletBonus: true,
          productRewards: true,
        },
      },
      offer: {
        select: { title: true },
      },
    },
  });

  if (!membership) {
    console.warn(`[ACTIVATION] Membership ${membershipId} not found (deleted by cron?)`);
    return { success: false, membershipData: null };
  }

  // Late payment check: if cancelled by cron after timeout
  if (membership.status === "cancelled") {
    console.warn(
      `[ACTIVATION] Late payment for membership ${membershipId}. ` +
      `Cron already cancelled it. Booking spots may have been reassigned. Manual review required.`
    );
    // Record in transaction metadata for admin review/refund
    const existing = await tx.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { metadata: true },
    });
    await tx.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        metadata: stringifyJson({
          ...(parseJson(existing?.metadata) ?? {}),
          latePaymentWarning: true,
          membershipStatus: "cancelled",
          paymentReceivedAt: new Date().toISOString(),
        }),
      },
    });
    return { success: false, membershipData: null };
  }

  // Already active - return existing state
  if (membership.status === "active") {
    const duration = membership.snapshotDurationDays ?? membership.membership?.duration ?? 30;
    return {
      success: true,
      membershipData: {
        status: membership.status,
        startDate: new Date(), // Will be overwritten by actual startDate if available
        offerId: membership.offerId,
        membership: { ...membership.membership, duration },
        offer: membership.offer,
      },
    };
  }

  if (membership.status === "pending_payment") {
    const now = new Date();
    // Pending offer memberships carry their purchase-time duration. A
    // later edit to the offer or linked plan cannot alter this activation.
    const duration = membership.snapshotDurationDays ?? membership.membership?.duration ?? 30;
    const endDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    // Atomic activation: race vs cron cleanup
    const activated = await tx.userMembership.updateMany({
      where: { id: membershipId, status: "pending_payment" },
      data: {
        status: "active",
        startDate: now,
        endDate,
        pendingExpiresAt: null, // Clear timeout on successful activation
      },
    });

    if (activated.count === 0) {
      console.warn(`[ACTIVATION] Membership ${membershipId} already processed (cron won race)`);
      return { success: false, membershipData: null };
    }

    console.log(`[ACTIVATION] Successfully activated membership ${membershipId}`);
    return {
      success: true,
      membershipData: {
        status: "active",
        startDate: now,
        offerId: membership.offerId,
        membership: { ...membership.membership, duration },
        offer: membership.offer,
      },
    };
  }

  // Invalid status for activation
  return { success: false, membershipData: null };
}
