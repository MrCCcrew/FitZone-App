import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

// GET /api/admin/accounting/customers-report
// Query params: search, status (all|active|expired), page, limit
export async function GET(req: Request) {
  const guard = await requireAdminFeature("accounting");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim();
  const status = searchParams.get("status") ?? "all"; // all | active | expired
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit  = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") ?? "30", 10)));

  const now = new Date();

  const userWhere: Record<string, unknown> = {
    role: "member",
    ...(search
      ? {
          OR: [
            { name:  { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  // Fetch all matching users (we need ALL to apply status filter before paging)
  const allUsers = await db.user.findMany({
    where: userWhere,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      isActive: true,
      wallet:       { select: { balance: true } },
      rewardPoints: { select: { points: true, tier: true } },
      memberships: {
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          status: true,
          paymentAmount: true,
          paymentMethod: true,
          offerTitle: true,
          totalSessions: true,
          membership: { select: { name: true, kind: true, sessionsCount: true, duration: true } },
          bookings: {
            select: { id: true, status: true, paidAmount: true, createdAt: true },
          },
          attendanceCheckIns: { select: { id: true } },
        },
      },
      bookings: {
        where: { userMembershipId: null },
        select: {
          id: true, status: true, paidAmount: true, createdAt: true,
          schedule: {
            select: { class: { select: { name: true } }, date: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // ── Build full rows ──────────────────────────────────────────────────────
  const userIds = allUsers.map(u => u.id);

  const [discountUsages, trainerCodes, staffCodes] = await Promise.all([
    db.discountCodeUsage.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        discountAmount: true,
        discountCode: { select: { code: true } },
      },
    }),
    db.trainerDiscountCode.findMany({
      where: { targetUserId: { in: userIds }, isUsed: true },
      select: { targetUserId: true, code: true, discountType: true, discountValue: true },
    }),
    db.staffDiscountCode.findMany({
      where: { targetUserId: { in: userIds }, isUsed: true },
      select: { targetUserId: true, code: true, discountType: true, discountValue: true },
    }),
  ]);

  type CodeEntry = { code: string; amount: number; source: string };
  const discountMap = new Map<string, CodeEntry[]>();
  for (const uid of userIds) discountMap.set(uid, []);
  for (const du of discountUsages) {
    discountMap.get(du.userId)?.push({ code: du.discountCode.code, amount: du.discountAmount, source: "كود خصم" });
  }
  for (const tc of trainerCodes) {
    discountMap.get(tc.targetUserId)?.push({
      code: tc.code, amount: tc.discountType === "fixed" ? tc.discountValue : 0, source: "كود مدربة",
    });
  }
  for (const sc of staffCodes) {
    discountMap.get(sc.targetUserId)?.push({
      code: sc.code, amount: sc.discountType === "fixed" ? sc.discountValue : 0, source: "كود موظف",
    });
  }

  const allRows = allUsers
    .map(u => {
      const memberships = u.memberships.map(m => {
        const endDate        = new Date(m.endDate);
        const isActive       = m.status === "active" && endDate >= now;
        const remainingDays  = isActive ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000)) : 0;
        const usedSessions   = m.attendanceCheckIns.length;
        const totalSess      = m.totalSessions ?? m.membership.sessionsCount ?? null;
        const remainSessions = totalSess !== null ? Math.max(0, totalSess - usedSessions) : null;
        const confirmedBkgs  = m.bookings.filter(b => b.status !== "cancelled").length;

        return {
          id: m.id,
          membershipName: m.offerTitle ? `${m.membership.name} (${m.offerTitle})` : m.membership.name,
          kind: m.membership.kind,
          startDate: m.startDate.toISOString(),
          endDate: m.endDate.toISOString(),
          status: isActive ? "active" : m.status,
          paymentAmount: m.paymentAmount,
          paymentMethod: m.paymentMethod ?? "—",
          remainingDays,
          totalSessions: totalSess,
          usedSessions,
          remainSessions,
          bookingsCount: confirmedBkgs,
        };
      });

      const activeMemberships = memberships.filter(m => m.status === "active");

      // Status filter
      if (status === "active"  && activeMemberships.length === 0) return null;
      if (status === "expired" && activeMemberships.length > 0)   return null;

      const directBookings = u.bookings.map(b => ({
        id: b.id,
        className: b.schedule.class.name,
        date: b.schedule.date.toISOString(),
        status: b.status,
        paidAmount: b.paidAmount,
      }));

      const totalMembershipPaid = memberships.reduce((s, m) => s + m.paymentAmount, 0);
      const totalBookingPaid    =
        directBookings.reduce((s, b) => s + b.paidAmount, 0) +
        u.memberships.flatMap(m => m.bookings).reduce((s, b) => s + b.paidAmount, 0);

      const discounts    = discountMap.get(u.id) ?? [];
      const totalDiscounts = discounts.reduce((s, d) => s + d.amount, 0);

      const activeMembership = memberships.find(m => m.status === "active") ?? null;

      return {
        id: u.id,
        name: u.name ?? "—",
        email: u.email ?? "—",
        phone: u.phone ?? null,
        isActive: u.isActive,
        joinedAt: u.createdAt.toISOString(),
        walletBalance: u.wallet?.balance ?? 0,
        rewardPoints:  u.rewardPoints?.points ?? 0,
        rewardTier:    u.rewardPoints?.tier ?? "bronze",

        totalPaid: totalMembershipPaid + totalBookingPaid,
        totalMembershipPaid,
        totalBookingPaid,
        totalDiscounts,

        membershipsCount: memberships.length,
        activeMembership,
        memberships,
        directBookings,
        discounts,
      };
    })
    .filter(Boolean);

  const total = allRows.length;
  const paged = allRows.slice((page - 1) * limit, page * limit);

  return NextResponse.json({ rows: paged, total, page, limit, totalPages: Math.ceil(total / limit) });
}
