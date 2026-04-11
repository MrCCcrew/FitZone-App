import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();
  const membershipId = searchParams.get("membershipId") ?? null;

  if (!code) {
    return NextResponse.json({ error: "الرجاء إدخال كود الخصم." }, { status: 400 });
  }

  const discount = await db.discountCode.findUnique({ where: { code } });

  if (!discount || !discount.isActive) {
    return NextResponse.json({ error: "كود الخصم غير صالح أو غير موجود." }, { status: 404 });
  }

  if (discount.expiresAt && discount.expiresAt < new Date()) {
    return NextResponse.json({ error: "انتهت صلاحية كود الخصم." }, { status: 400 });
  }

  if (discount.maxUses != null && discount.usedCount >= discount.maxUses) {
    return NextResponse.json({ error: "تم استنفاد الحد الأقصى لاستخدام هذا الكود." }, { status: 400 });
  }

  // Check if this user already used this code
  const alreadyUsed = await db.discountCodeUsage.findFirst({
    where: { discountCodeId: discount.id, userId: user.id },
  });
  if (alreadyUsed) {
    return NextResponse.json({ error: "لقد استخدمت هذا الكود من قبل." }, { status: 400 });
  }

  // Calculate discount amount if membershipId provided
  let discountAmount: number | null = null;
  if (membershipId) {
    const membership = await db.membership.findUnique({ where: { id: membershipId } });
    if (membership) {
      const basePrice = membership.priceAfter && membership.priceAfter > 0 ? membership.priceAfter : membership.price;
      if (discount.minAmount != null && basePrice < discount.minAmount) {
        return NextResponse.json(
          { error: `هذا الكود يتطلب حد أدنى للاشتراك ${discount.minAmount} جنيه.` },
          { status: 400 },
        );
      }
      discountAmount =
        discount.type === "percentage"
          ? Math.round((basePrice * discount.value) / 100 * 100) / 100
          : Math.min(discount.value, basePrice);
    }
  }

  return NextResponse.json({
    valid: true,
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: discount.value,
    description: discount.description,
    descriptionEn: discount.descriptionEn,
    discountAmount,
  });
}
