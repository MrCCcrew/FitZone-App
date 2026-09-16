type ExchangeAuditTransactionClient = {
  membershipClassExchange: {
    updateMany: (
      args: any,
    ) => PromiseLike<{
      count: number;
    }>;
  };
};

/**
 * Reverses the audit/domain record for a cancelled class-exchange booking.
 *
 * The Booking.status transition is authoritative for operational entitlement
 * consumption. This helper keeps the exchange audit lifecycle consistent.
 *
 * Ordinary bookings have no MembershipClassExchange row, so this is a safe
 * no-op for every existing booking.
 */
export async function reverseMembershipClassExchange(
  tx: ExchangeAuditTransactionClient,
  input: {
    bookingId: string;
    reversedByUserId: string;
    reversedAt?: Date;
  },
) {
  const reversedAt =
    input.reversedAt ?? new Date();

  const result =
    await tx.membershipClassExchange.updateMany({
      where: {
        bookingId: input.bookingId,
        status: "active",
      },
      data: {
        status: "reversed",
        reversedAt,
        reversedByUserId:
          input.reversedByUserId,
      },
    });

  return {
    reversed: result.count === 1,
  };
}
