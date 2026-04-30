import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { getCurrentAdminUser } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const currentUser = await getCurrentAppUser();
    const currentAdmin = currentUser ? null : await getCurrentAdminUser();
    const userId = currentUser?.id ?? currentAdmin?.id;

    if (!userId) {
      return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } });
    }

    if (currentAdmin && !currentUser) {
      return NextResponse.json({
        authenticated: true,
        isAppUser: false,
        user: {
          name: currentAdmin.name ?? "",
          email: currentAdmin.email ?? "",
          role: currentAdmin.role,
        },
        walletBalance: 0,
        rewardPoints: 0,
        rewardTier: "bronze",
        referralCode: null,
        referralEarned: 0,
        membership: null,
        upcomingBookingDate: null,
      }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        rewardPoints: true,
        referral: true,
        memberships: {
          where: { status: "active" },
          include: { membership: true, offer: { select: { title: true } } },
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
      if (currentUser) {
        return NextResponse.json({
          authenticated: true,
          user: {
            name: currentUser.name ?? "",
            email: currentUser.email ?? "",
            role: currentUser.role,
          },
          walletBalance: 0,
          rewardPoints: 0,
          rewardTier: "bronze",
          referralCode: null,
          referralEarned: 0,
          membership: null,
          upcomingBookingDate: null,
        }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } });
      }

      return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } });
    }

    const activeMembership = user.memberships[0];
    const upcomingBooking = user.bookings[0];

    return NextResponse.json({
      authenticated: true,
      isAppUser: true,
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
            name: activeMembership.offerTitle || activeMembership.offer?.title || activeMembership.membership.name,
            status: activeMembership.status,
            endDate: activeMembership.endDate.toISOString(),
          }
        : null,
      upcomingBookingDate: upcomingBooking?.schedule.date.toISOString() ?? null,
    }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } });
  } catch (error) {
    console.error("[ME_SUMMARY]", error);
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } });
  }
}
