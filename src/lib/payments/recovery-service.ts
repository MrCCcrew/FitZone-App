/**
 * CLI-safe recovery service for standalone scripts.
 * Does not import Next.js server-only or analytics modules.
 */

import { db } from "@/lib/db";
import { runPaidMembershipPostActivationReconciliation } from "@/lib/payments/reconciliation-helper";
import { activatePaidMembershipTx } from "@/lib/payments/activation-shared";

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Restore bookings from metadata snapshot after late payment recovery.
 * Only recreates bookings if:
 * - Current booking count is 0
 * - Metadata contains snapshot or original scheduleIds
 * - Target schedules still exist and have available spots
 * - Schedule dates are in the future
 */
async function restoreBookingsFromMetadata(
  userId: string,
  userMembershipId: string,
  paymentMetadata: string | null
): Promise<void> {
  // Check if bookings already exist
  const existingBookingsCount = await db.booking.count({
    where: { userMembershipId },
  });

  if (existingBookingsCount > 0) {
    console.info(`[BOOKING_RECOVERY] Membership ${userMembershipId} already has ${existingBookingsCount} bookings - skip restoration`);
    return;
  }

  const metadata = parseJson(paymentMetadata);
  if (!metadata) {
    console.info(`[BOOKING_RECOVERY] No metadata available for booking recovery`);
    return;
  }

  // Prefer deletedBookingsSnapshot (contains actual booked schedules with details)
  const snapshot = metadata.deletedBookingsSnapshot as {
    bookings?: Array<{
      scheduleId: string;
      classId: string;
      date: string;
      time: string;
      status: string;
    }>;
  } | undefined;

  let scheduleIdsToRestore: string[] = [];

  if (snapshot?.bookings && Array.isArray(snapshot.bookings)) {
    scheduleIdsToRestore = snapshot.bookings.map((b) => b.scheduleId);
    console.info(`[BOOKING_RECOVERY] Found ${scheduleIdsToRestore.length} bookings in deletedBookingsSnapshot`);
  } else {
    // Fallback to original scheduleIds selection
    const recoveryData = metadata.bookingRecoveryData as {
      selectedScheduleIds?: string[];
    } | undefined;

    if (recoveryData?.selectedScheduleIds && Array.isArray(recoveryData.selectedScheduleIds)) {
      scheduleIdsToRestore = recoveryData.selectedScheduleIds;
      console.info(`[BOOKING_RECOVERY] Found ${scheduleIdsToRestore.length} scheduleIds in bookingRecoveryData`);
    }
  }

  if (scheduleIdsToRestore.length === 0) {
    console.info(`[BOOKING_RECOVERY] No schedule data found in metadata`);
    return;
  }

  // Get valid future schedules with available spots
  const now = new Date();
  const validSchedules = await db.schedule.findMany({
    where: {
      id: { in: scheduleIdsToRestore },
      date: { gte: now },
      availableSpots: { gt: 0 },
    },
    select: {
      id: true,
      availableSpots: true,
      date: true,
      time: true,
      classId: true,
      class: { select: { price: true } },
    },
  });

  if (validSchedules.length === 0) {
    console.info(`[BOOKING_RECOVERY] No valid future schedules with available spots found`);
    return;
  }

  console.info(`[BOOKING_RECOVERY] Restoring ${validSchedules.length} bookings (${scheduleIdsToRestore.length - validSchedules.length} skipped - full/past/missing)`);

  let restoredCount = 0;
  let skippedCount = 0;

  for (const schedule of validSchedules) {
    try {
      // Create booking and decrement spot atomically with row-level locking
      await db.$transaction(async (tx) => {
        // 1. Lock the schedule row first (forces serialization of concurrent recoveries)
        await tx.$queryRaw`
          SELECT \`id\`, \`availableSpots\`
          FROM \`Schedule\`
          WHERE \`id\` = ${schedule.id}
          FOR UPDATE
        `;

        // 2. Check for existing booking AFTER acquiring lock (race-safe)
        const existing = await tx.booking.findFirst({
          where: {
            userId,
            scheduleId: schedule.id,
            userMembershipId,
          },
        });

        if (existing) {
          console.info(`[BOOKING_RECOVERY] Booking already exists for schedule ${schedule.id} - skip`);
          skippedCount++;
          return;
        }

        // 3. Check spot availability AFTER lock (reads consistent locked state)
        const currentSchedule = await tx.schedule.findUnique({
          where: { id: schedule.id },
          select: { availableSpots: true },
        });

        if (!currentSchedule || currentSchedule.availableSpots <= 0) {
          console.info(`[BOOKING_RECOVERY] Schedule ${schedule.id} no longer has spots - skip`);
          skippedCount++;
          return;
        }

        // 4. Create booking
        await tx.booking.create({
          data: {
            userId,
            scheduleId: schedule.id,
            userMembershipId,
            status: "confirmed",
            paidAmount: schedule.class.price,
          },
        });

        // 5. Decrement available spots
        await tx.schedule.update({
          where: { id: schedule.id },
          data: { availableSpots: { decrement: 1 } },
        });

        restoredCount++;
      });
    } catch (error: any) {
      console.error(`[BOOKING_RECOVERY] Failed to restore booking for schedule ${schedule.id}:`, error.message);
      skippedCount++;
    }
  }

  console.info(`[BOOKING_RECOVERY] Restoration complete: ${restoredCount} restored, ${skippedCount} skipped`);
}

/**
 * Map payment transaction to return type.
 * Simplified version without analytics dependencies.
 */
function mapPaymentTransaction(transaction: any) {
  return {
    id: transaction.id,
    referenceCode: transaction.referenceCode,
    provider: transaction.provider,
    purpose: transaction.purpose,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    orderId: transaction.orderId,
    membershipId: transaction.membershipId,
    offerId: transaction.offerId,
    checkoutUrl: transaction.checkoutUrl,
    iframeUrl: transaction.iframeUrl,
    providerReference: transaction.providerReference,
    externalReference: transaction.externalReference,
    returnUrl: transaction.returnUrl,
    cancelUrl: transaction.cancelUrl,
    payload: null,
    metadata: null,
    expiresAt: transaction.expiresAt,
    paidAt: transaction.paidAt ?? null,
    failedAt: transaction.failedAt ?? null,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

/**
 * Recovery function for payments already marked "paid" but with pending memberships.
 * CLI-safe version without analytics imports.
 */
export async function recoverPaidMembershipActivation(paymentTransactionId: string) {
  const payment = await db.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
  });

  if (!payment) {
    throw new Error("Payment transaction not found");
  }

  if (payment.status !== "paid") {
    throw new Error(
      `Recovery rejected: Payment status is "${payment.status}", expected "paid"`
    );
  }

  if (!payment.membershipId) {
    throw new Error("Recovery rejected: No membership linked to this payment");
  }

  const membership = await db.userMembership.findUnique({
    where: { id: payment.membershipId },
    select: { status: true },
  });

  if (!membership) {
    throw new Error("Recovery rejected: Membership not found");
  }

  if (membership.status === "active") {
    console.info(
      `[RECOVERY] Membership ${payment.membershipId} already active - idempotent return`
    );
    return mapPaymentTransaction(payment);
  }

  if (membership.status !== "pending_payment") {
    throw new Error(
      `Recovery rejected: Membership status is "${membership.status}", expected "pending_payment"`
    );
  }

  console.info(`[RECOVERY] Activating paid membership ${payment.membershipId} for payment ${paymentTransactionId}`);

  let activationSucceeded = false;
  let membershipData: any | null = null;

  await db.$transaction(async (tx) => {
    const result = await activatePaidMembershipTx(
      tx,
      paymentTransactionId,
      payment.membershipId!
    );
    activationSucceeded = result.success;
    membershipData = result.membershipData;
  });

  if (!activationSucceeded || !membershipData) {
    throw new Error("Recovery failed: Membership activation unsuccessful");
  }

  console.info(`[RECOVERY] Membership activated, attempting booking restoration`);

  // Restore bookings from metadata if they were deleted during timeout cleanup
  try {
    await restoreBookingsFromMetadata(payment.userId, payment.membershipId, payment.metadata);
  } catch (error: any) {
    console.error(`[RECOVERY] Booking restoration failed (non-fatal):`, error.message);
    // Continue with reconciliation even if booking restoration fails
  }

  console.info(`[RECOVERY] Running post-activation reconciliation`);

  await runPaidMembershipPostActivationReconciliation({
    transactionId: paymentTransactionId,
    userId: payment.userId,
    userMembershipId: payment.membershipId,
    membershipData,
    paymentAmount: payment.amount,
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paidAt,
    transactionMetadata: payment.metadata,
  });

  const recovered = await db.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
  });

  console.info(`[RECOVERY] Successfully recovered payment ${paymentTransactionId}`);
  return mapPaymentTransaction(recovered!);
}

/**
 * Verify payment transaction (simplified for CLI).
 * For full verification with Paymob, use the service.ts version.
 */
export async function verifyPaymentTransaction(transactionId: string) {
  // Import dynamically to avoid server-only in CLI context
  const { verifyPaymentTransaction: serviceVerify } = await import("@/lib/payments/service");
  return serviceVerify(transactionId);
}
