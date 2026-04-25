import { db } from "@/lib/db";

type CleanupDbClient = Pick<
  typeof db,
  | "attendanceCheckIn"
  | "attendancePass"
  | "booking"
  | "chatSession"
  | "membership"
  | "offer"
  | "schedule"
  | "userMembership"
>;

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

async function cleanupUserMembershipRecords(
  tx: CleanupDbClient,
  userMembershipIds: string[],
) {
  if (userMembershipIds.length === 0) return { deletedMemberships: 0, deletedBookings: 0 };

  const today = startOfToday();
  const bookings = await tx.booking.findMany({
    where: { userMembershipId: { in: userMembershipIds } },
    select: {
      id: true,
      status: true,
      scheduleId: true,
      schedule: {
        select: {
          date: true,
        },
      },
    },
  });

  const restorableScheduleIds = Array.from(
    new Set(
      bookings
        .filter((booking) => booking.status === "confirmed" && booking.schedule.date >= today)
        .map((booking) => booking.scheduleId),
    ),
  );

  if (restorableScheduleIds.length > 0) {
    await Promise.all(
      restorableScheduleIds.map((scheduleId) =>
        tx.schedule.update({
          where: { id: scheduleId },
          data: { availableSpots: { increment: 1 } },
        }),
      ),
    );
  }

  await tx.attendanceCheckIn.deleteMany({
    where: { userMembershipId: { in: userMembershipIds } },
  });

  await tx.attendancePass.deleteMany({
    where: { userMembershipId: { in: userMembershipIds } },
  });

  await tx.booking.deleteMany({
    where: { userMembershipId: { in: userMembershipIds } },
  });

  await tx.userMembership.deleteMany({
    where: { id: { in: userMembershipIds } },
  });

  return {
    deletedMemberships: userMembershipIds.length,
    deletedBookings: bookings.length,
  };
}

export async function deleteOfferAndLinkedClientData(
  tx: CleanupDbClient,
  offerId: string,
) {
  const linkedMemberships = await tx.userMembership.findMany({
    where: { offerId },
    select: { id: true },
  });

  const membershipCleanup = await cleanupUserMembershipRecords(
    tx,
    linkedMemberships.map((membership) => membership.id),
  );

  await tx.offer.delete({
    where: { id: offerId },
  });

  return membershipCleanup;
}

export async function deleteMembershipAndLinkedClientData(
  tx: CleanupDbClient,
  membershipId: string,
) {
  const linkedOffers = await tx.offer.findMany({
    where: { membershipId },
    select: { id: true },
  });

  const linkedOfferIds = linkedOffers.map((offer) => offer.id);
  const linkedMemberships = await tx.userMembership.findMany({
    where: {
      OR: [
        { membershipId },
        linkedOfferIds.length > 0 ? { offerId: { in: linkedOfferIds } } : undefined,
      ].filter(Boolean) as Array<Record<string, unknown>>,
    },
    select: { id: true },
  });

  const membershipCleanup = await cleanupUserMembershipRecords(
    tx,
    linkedMemberships.map((membership) => membership.id),
  );

  if (linkedOfferIds.length > 0) {
    await tx.offer.deleteMany({
      where: { id: { in: linkedOfferIds } },
    });
  }

  await tx.chatSession.updateMany({
    where: { recommendedMembershipId: membershipId },
    data: { recommendedMembershipId: null },
  });

  await tx.membership.delete({
    where: { id: membershipId },
  });

  return {
    ...membershipCleanup,
    deletedOffers: linkedOfferIds.length,
  };
}
