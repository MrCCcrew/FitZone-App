/**
 * Financial settlement policy for a membership awaiting Paymob payment.
 *
 * A failed payment attempt is not the same as expiration of the
 * original 60-minute membership reservation.
 *
 * This policy only defers restoration while an original hold exists.
 * It must NOT be used as permission to create another payment.
 */
export type MembershipPaymentRestoreContext = {
  purpose: string | null;
  membershipId: string | null;
  membershipStatus: string | null;
  pendingExpiresAt: Date | null;
  now?: Date;
};

export function shouldDeferMembershipPaymentRestore(
  input: MembershipPaymentRestoreContext,
): boolean {
  if (input.purpose !== "membership") return false;
  if (!input.membershipId) return false;
  if (input.membershipStatus !== "pending_payment") return false;

  const expiry = input.pendingExpiresAt?.getTime();
  const now = (input.now ?? new Date()).getTime();

  if (expiry == null || !Number.isFinite(expiry)) return false;
  if (!Number.isFinite(now)) return false;

  return expiry > now;
}