import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const bookings = await db.booking.findMany({
    where: { userId: currentUser.id },
    include: {
      userMembership: { select: { status: true } },
      offerBoxEntitlement: {
        select: {
          id: true,
          userId: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
      friendOfferEntitlement: {
        select: {
          id: true,
          userId: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
      schedule: { include: { class: { include: { trainer: true } } } },
      rescheduleRequests: {
        where: { status: "pending" },
        include: {
          targetSchedule: {
            include: {
              class: {
                include: { trainer: true },
              },
            },
          },
        },
        orderBy: { requestedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // One customer-facing visibility rule:
  // - standalone bookings are always visible
  // - confirmed bookings require an active membership
  // - historical cancelled/attended/noshow bookings remain visible
  //   even after their membership later expires/cancels
  const visibleBookings = bookings.filter((b) => {
    // Independent friend-offer bookings must remain visible to their owner
    // without relying on UserMembership or its expiry/activation state.
    if (b.friendOfferEntitlementId) {
      return (
        !b.userMembershipId &&
        !b.offerBoxEntitlementId &&
        b.friendOfferEntitlement?.userId === currentUser.id
      );
    }

    if (b.offerBoxEntitlementId) {
      return (
        !b.userMembershipId &&
        b.offerBoxEntitlement?.userId === currentUser.id
      );
    }

    if (!b.userMembershipId) return true;
    if (b.status !== "confirmed") return true;

    if (b.userMembership?.status === "active") {
      return true;
    }

    /*
     * Confirmed entitlement-recovery bookings remain visible after the
     * contractual membership itself expires.
     */
    return (
      b.isMakeup === true &&
      b.userMembership?.status === "expired"
    );
  });

  return NextResponse.json(
    visibleBookings.map((b) => ({
      id: b.id,
      scheduleId: b.scheduleId,
      classId: b.schedule.classId,
      className: b.schedule.class.name,
      trainerName: b.schedule.class.trainer.name,
      date: b.schedule.date.toISOString(),
      time: b.schedule.time,
      status:
        b.status === "confirmed" &&
        b.offerBoxEntitlement?.status === "pending_payment"
          ? "pending_payment"
          : b.status,
      isPendingPayment:
        b.status === "confirmed" &&
        b.offerBoxEntitlement?.status === "pending_payment",
      type: b.schedule.class.type,
      userMembershipId: b.userMembershipId ?? null,
      offerBoxEntitlementId: b.offerBoxEntitlementId ?? null,
      friendOfferEntitlementId: b.friendOfferEntitlementId ?? null,
      bookingOwnerType: b.friendOfferEntitlementId
        ? "friend_offer"
        : b.offerBoxEntitlementId
          ? "offer_box"
          : b.userMembershipId
            ? "membership"
            : "standalone",
      isMakeup: b.isMakeup,
      makeupReason: b.makeupReason ?? null,
      pendingReschedule: b.rescheduleRequests[0]
        ? {
            id: b.rescheduleRequests[0].id,
            requestType: b.rescheduleRequests[0].requestType,
            absenceReason: b.rescheduleRequests[0].absenceReason,
            requestedAt: b.rescheduleRequests[0].requestedAt.toISOString(),
            targetSchedule: {
              id: b.rescheduleRequests[0].targetSchedule.id,
              classId: b.rescheduleRequests[0].targetSchedule.classId,
              className: b.rescheduleRequests[0].targetSchedule.class.name,
              trainerName:
                b.rescheduleRequests[0].targetSchedule.class.trainer?.name ?? "",
              date:
                b.rescheduleRequests[0].targetSchedule.date.toISOString(),
              time: b.rescheduleRequests[0].targetSchedule.time,
              type: b.rescheduleRequests[0].targetSchedule.class.type,
            },
          }
        : null,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
