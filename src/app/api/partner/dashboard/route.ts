import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function getPartnerProfile(userId: string) {
  return db.partner.findUnique({ where: { userId } });
}

export async function GET() {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await getPartnerProfile(guard.session.user.id);
  if (!partner) return NextResponse.json({ error: "لم يتم العثور على ملف الشريك." }, { status: 404 });

  const [codes, links, commissions, recentMemberships] = await Promise.all([
    db.partnerCode.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    }),
    db.partnerAffiliateLink.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    }),
    db.partnerCommission.findMany({
      where: { partnerId: partner.id },
      include: {
        userMembership: {
          include: {
            user: { select: { name: true, email: true } },
            membership: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.userMembership.findMany({
      where: { partnerId: partner.id },
      include: {
        user: { select: { name: true, email: true } },
        membership: { select: { name: true } },
      },
      orderBy: { startDate: "desc" },
      take: 10,
    }),
  ]);

  const totalPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalPaid = commissions.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: partner.name,
      nameEn: partner.nameEn,
      category: partner.category,
      logoUrl: partner.logoUrl,
      commissionRate: partner.commissionRate,
      commissionType: partner.commissionType,
      isActive: partner.isActive,
    },
    stats: {
      totalCodes: codes.length,
      activeCodes: codes.filter((c) => c.isActive).length,
      totalLinks: links.length,
      totalCustomers: recentMemberships.length,
      totalCommissionPending: totalPending,
      totalCommissionPaid: totalPaid,
    },
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxUsage: c.maxUsage,
      usageCount: c.usageCount,
      isActive: c.isActive,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    links: links.map((l) => ({
      id: l.id,
      token: l.token,
      label: l.label,
      clickCount: l.clickCount,
      isActive: l.isActive,
      createdAt: l.createdAt.toISOString(),
    })),
    recentCommissions: commissions.map((c) => ({
      id: c.id,
      amount: c.amount,
      status: c.status,
      withdrawnAt: c.withdrawnAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      customerName: c.userMembership.user.name ?? "—",
      membershipName: c.userMembership.membership.name,
    })),
  });
}
