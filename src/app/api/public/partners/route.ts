import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const partners = await db.partner.findMany({
    where: { isActive: true, showOnPublicPage: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(partners.map((p) => ({
    id: p.id,
    name: p.name,
    nameEn: p.nameEn,
    category: p.category,
    logoUrl: p.logoUrl,
    websiteUrl: p.websiteUrl ?? null,
    contactPhone: p.contactPhone ?? null,
    code:
      p.memberBenefitCode && p.memberBenefitRate != null
        ? {
            code: p.memberBenefitCode,
            discountType: "percentage",
            discountValue: p.memberBenefitRate,
          }
        : null,
  })));
}
