import { NextResponse } from "next/server";
import { recoverPaidMembershipActivation } from "@/lib/payments/service";
import { db } from "@/lib/db";

export async function GET() {
  if (process.env.APP_ENV !== "staging") {
    return NextResponse.json({ error: "NOT_STAGING" }, { status: 403 });
  }

  const paymentId = "cmss0s5ue0004l1hwme6jhrdr";
  const membershipId = "cmss0s5u70002l1hwpsvgtg61";
  const bookingId = "cmss0s5uk0006l1hwh9va8ady";
  const scheduleId = "cmr16j5dm003al1ei57qltohb";

  const result = await recoverPaidMembershipActivation(paymentId);

  const [membership, payment, booking, schedule] = await Promise.all([
    db.userMembership.findUnique({
      where: { id: membershipId },
      select: { status: true, pendingExpiresAt: true },
    }),
    db.paymentTransaction.findUnique({
      where: { id: paymentId },
      select: { status: true, paidAt: true },
    }),
    db.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, userMembershipId: true, scheduleId: true },
    }),
    db.schedule.findUnique({
      where: { id: scheduleId },
      select: { availableSpots: true },
    }),
  ]);

  const checks = {
    membershipActive: membership?.status === "active",
    pendingExpiryCleared: membership?.pendingExpiresAt === null,
    paymentStillPaid: payment?.status === "paid",
    bookingStillConfirmed: booking?.status === "confirmed",
    bookingStillLinked: booking?.userMembershipId === membershipId,
    sameSchedule: booking?.scheduleId === scheduleId,
    seatNotChangedTwice: schedule?.availableSpots === 3,
  };

  return NextResponse.json({
    recoveryResult: result,
    membership,
    payment,
    booking,
    schedule,
    checks,
    ALL_PASS: Object.values(checks).every(Boolean),
  });
}
