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

  const [codes, links, commissions, codeCustomers] = await Promise.all([
    db.partnerCode.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    }),
    db.partnerAffiliateLink.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    }),
    // All commissions — only created on paid subscriptions
    db.partnerCommission.findMany({
      where: { partnerId: partner.id },
      include: {
        userMembership: {
          include: {
            user: { select: { name: true } },
            membership: { select: { name: true } },
            affiliateLink: { select: { label: true } },
            partnerCode: { select: { code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    // All subscriptions where partner's discount code was used
    db.userMembership.findMany({
      where: { partnerCode: { partnerId: partner.id } },
      include: {
        user: { select: { name: true } },
        membership: { select: { name: true } },
        partnerCode: { select: { code: true, discountType: true, discountValue: true } },
      },
      orderBy: { startDate: "desc" },
      take: 100,
    }),
  ]);

  const totalPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalWithdrawn = commissions.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);

  // Referral conversions = commissions that came via an affiliate link (paid subscriptions only)
  const referralCustomers = commissions.filter((c) => c.userMembership.affiliateLinkId !== null);
  // Total unique customers (code + referral, deduped by userId via Set on userMembershipId)
  const totalCustomers = new Set([
    ...codeCustomers.map((u) => u.userId),
    ...referralCustomers.map((c) => c.userMembership.userId),
  ]).size;

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
      totalCustomers,
      totalCommissionPending: totalPending,
      totalCommissionPaid: totalWithdrawn,
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
      source: c.userMembership.affiliateLinkId ? "link" : "code",
    })),
    codeCustomers: codeCustomers.map((um) => ({
      id: um.id,
      customerName: um.user.name ?? "—",
      membershipName: um.membership.name,
      paymentAmount: um.paymentAmount,
      codeName: um.partnerCode!.code,
      discountType: um.partnerCode!.discountType,
      discountValue: um.partnerCode!.discountValue,
      createdAt: um.startDate.toISOString(),
    })),
    referralCustomers: referralCustomers.map((c) => ({
      id: c.id,
      customerName: c.userMembership.user.name ?? "—",
      membershipName: c.userMembership.membership.name,
      paymentAmount: c.userMembership.paymentAmount,
      commissionAmount: c.amount,
      commissionStatus: c.status,
      linkLabel: c.userMembership.affiliateLink?.label ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
