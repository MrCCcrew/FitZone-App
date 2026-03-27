import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ authenticated: false });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        rewardPoints: true,
        referral: true,
        memberships: {
          where: { status: "active" },
          include: { membership: true },
          orderBy: { startDate: "desc" },
          take: 1,
        },
        bookings: {
          where: { status: "confirmed" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { schedule: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ authenticated: false });
    }

    const activeMembership = user.memberships[0];
    const upcomingBooking = user.bookings[0];

    return NextResponse.json({
      authenticated: true,
      user: {
        name: user.name ?? "",
        email: user.email ?? "",
        role: user.role,
      },
      walletBalance: user.wallet?.balance ?? 0,
      rewardPoints: user.rewardPoints?.points ?? 0,
      rewardTier: user.rewardPoints?.tier ?? "bronze",
      referralCode: user.referral?.code ?? null,
      referralEarned: user.referral?.totalEarned ?? 0,
      membership: activeMembership
        ? {
            name: activeMembership.membership.name,
            status: activeMembership.status,
            endDate: activeMembership.endDate.toISOString(),
          }
        : null,
      upcomingBookingDate: upcomingBooking?.schedule.date.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[ME_SUMMARY]", error);
    return NextResponse.json({ authenticated: false });
  }
}
