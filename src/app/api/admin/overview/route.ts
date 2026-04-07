import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("overview");
  return "error" in guard ? guard.error : null;
}

const MONTHS_AR = ["يناير","فبراير","مارس","إبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export async function GET() {
  const err = await checkAdmin(); if (err) return err;

  const now  = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalMembers = await db.user.count({ where: { role: "member" } });
  const activeMembers = await db.userMembership.count({ where: { status: "active", endDate: { gt: now } } });
  const pendingOrders = await db.order.count({ where: { status: "pending" } });
  const totalClasses = await db.class.count();
  const totalProducts = await db.product.count({ where: { isActive: true } });
  const openComplaints = await db.complaint.count({ where: { status: { in: ["open", "in-progress"] } } });
  const monthlyRevenue = await db.order.aggregate({
    where: { status: { in: ["confirmed","delivered"] }, createdAt: { gte: startOfMonth } },
    _sum: { total: true },
  });
  const recentOrders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { user: { select: { name: true } } },
  });
  const recentUsers = await db.user.findMany({
    where: { role: "member" },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const recentComplaints = await db.complaint.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { user: { select: { name: true } } },
  });

  // Monthly revenue for last 6 months
  const monthlyData: { month: string; revenue: number }[] = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const dEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const agg = await db.order.aggregate({
      where: { status: { in: ["confirmed","delivered"] }, createdAt: { gte: d, lte: dEnd } },
      _sum: { total: true },
    });
    monthlyData.push({ month: MONTHS_AR[d.getMonth()], revenue: agg._sum.total ?? 0 });
  }

  // Membership plan distribution
  const memberships = await db.membership.findMany({ where: { isActive: true } });
  const planDist: { name: string; count: number }[] = [];
  for (const membership of memberships) {
    const count = await db.userMembership.count({ where: { membershipId: membership.id, status: "active" } });
    planDist.push({ name: membership.name, count });
  }

  // Activity log from recent events
  const activity = [
    ...recentUsers.map(u => ({ type: "member", text: `عضو جديد: ${u.name ?? u.email}`, time: u.createdAt })),
    ...recentOrders.map(o => ({ type: "order",  text: `طلب جديد من ${o.user.name ?? "—"} (${o.total.toLocaleString("ar-EG")} ج.م)`, time: o.createdAt })),
    ...recentComplaints.map(c => ({ type: "complaint", text: `شكوى من ${c.user.name ?? "—"}: ${c.subject}`, time: c.createdAt })),
  ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 8);

  return NextResponse.json({
    totalMembers,
    activeMembers,
    pendingOrders,
    totalClasses,
    totalProducts,
    openComplaints,
    monthlyRevenue: monthlyRevenue._sum.total ?? 0,
    monthlyData,
    planDistribution: planDist,
    activity: activity.map(a => ({ ...a, time: a.time.toISOString() })),
  });
}
