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
  const amount = parseFloat(searchParams.get("amount") ?? "0") || 0;
  const context = searchParams.get("context") ?? "all"; // "subscriptions" | "store" | "all"

  if (!code) {
    return NextResponse.json({ error: "الرجاء إدخال كود الخصم." }, { status: 400 });
  }

  // ── 1. Check standard DiscountCode table ─────────────────────────────────────
  const discount = await db.discountCode.findUnique({ where: { code } });

  const scopeAllowed = (codeScope: string) => {
    if (codeScope === "all") return true;
    if (context === "all") return true;
    return codeScope === context;
  };

  if (discount && discount.isActive) {
    if (!scopeAllowed(discount.scope ?? "all")) {
      const scopeLabel = discount.scope === "subscriptions" ? "الاشتراكات" : "المتجر";
      return NextResponse.json({ error: `هذا الكود صالح فقط في ${scopeLabel}.` }, { status: 400 });
    }
    if (discount.expiresAt && discount.expiresAt < new Date()) {
      return NextResponse.json({ error: "انتهت صلاحية كود الخصم." }, { status: 400 });
    }
    if (discount.maxUses != null && discount.usedCount >= discount.maxUses) {
      return NextResponse.json({ error: "تم استنفاد الحد الأقصى لاستخدام هذا الكود." }, { status: 400 });
    }
    const alreadyUsed = await db.discountCodeUsage.findFirst({
      where: { discountCodeId: discount.id, userId: user.id },
    });
    if (alreadyUsed) {
      return NextResponse.json({ error: "لقد استخدمت هذا الكود من قبل." }, { status: 400 });
    }

    let discountAmount: number | null = null;
    const basePrice = membershipId
      ? await db.membership.findUnique({ where: { id: membershipId } }).then((m) =>
          m ? (m.priceAfter && m.priceAfter > 0 ? m.priceAfter : m.price) : amount,
        )
      : amount;

    if (discount.minAmount != null && basePrice < discount.minAmount) {
      return NextResponse.json(
        { error: `هذا الكود يتطلب حد أدنى ${discount.minAmount} جنيه.` },
        { status: 400 },
      );
    }
    discountAmount =
      discount.type === "percentage"
        ? Math.round(((basePrice * discount.value) / 100) * 100) / 100
        : Math.min(discount.value, basePrice);

    return NextResponse.json({
      valid: true,
      source: "global",
      id: discount.id,
      code: discount.code,
      type: discount.type,
      value: discount.value,
      description: discount.description,
      descriptionEn: discount.descriptionEn,
      discountAmount,
    });
  }

  // ── 2. Check TrainerDiscountCode table ────────────────────────────────────────
  const trainerCode = await db.trainerDiscountCode.findUnique({
    where: { code },
    include: { trainer: { select: { id: true, name: true } } },
  });

  const basePrice = membershipId
    ? await db.membership.findUnique({ where: { id: membershipId } }).then((m) =>
        m ? (m.priceAfter && m.priceAfter > 0 ? m.priceAfter : m.price) : amount,
      )
    : amount;

  if (trainerCode) {
    if (trainerCode.targetUserId !== user.id) {
      return NextResponse.json({ error: "هذا الكود خاص بعميل آخر ولا يمكنك استخدامه." }, { status: 403 });
    }
    if (trainerCode.isUsed) {
      return NextResponse.json({ error: "تم استخدام هذا الكود من قبل." }, { status: 400 });
    }

    let discountAmount = 0;
    if (trainerCode.discountType === "fixed") {
      discountAmount = Math.min(trainerCode.discountValue, basePrice);
    } else {
      const raw = (basePrice * trainerCode.discountValue) / 100;
      discountAmount = trainerCode.maxDiscount != null ? Math.min(raw, trainerCode.maxDiscount) : raw;
      discountAmount = Math.round(discountAmount * 100) / 100;
    }

    return NextResponse.json({
      valid: true,
      source: "trainer",
      id: trainerCode.id,
      code: trainerCode.code,
      type: trainerCode.discountType,
      value: trainerCode.discountValue,
      maxDiscount: trainerCode.maxDiscount ?? null,
      description: `كود خصم من المدربة ${trainerCode.trainer.name}${trainerCode.note ? ` - ${trainerCode.note}` : ""}`,
      descriptionEn: `Discount code from trainer ${trainerCode.trainer.name}`,
      discountAmount,
    });
  }

  const staffCode = await db.staffDiscountCode.findUnique({ where: { code } });
  if (!staffCode) {
    return NextResponse.json({ error: "كود الخصم غير صالح أو غير موجود." }, { status: 404 });
  }
  if (staffCode.targetUserId !== user.id) {
    return NextResponse.json({ error: "هذا الكود خاص بعميل آخر ولا يمكنك استخدامه." }, { status: 403 });
  }
  if (staffCode.isUsed) {
    return NextResponse.json({ error: "تم استخدام هذا الكود من قبل." }, { status: 400 });
  }

  let discountAmount = 0;
  if (staffCode.discountType === "fixed") {
    discountAmount = Math.min(staffCode.discountValue, basePrice);
  } else {
    const raw = (basePrice * staffCode.discountValue) / 100;
    discountAmount = staffCode.maxDiscount != null ? Math.min(raw, staffCode.maxDiscount) : raw;
    discountAmount = Math.round(discountAmount * 100) / 100;
  }

  return NextResponse.json({
    valid: true,
    source: "staff",
    id: staffCode.id,
    code: staffCode.code,
    type: staffCode.discountType,
    value: staffCode.discountValue,
    maxDiscount: staffCode.maxDiscount ?? null,
    description: "كود خصم من موظف FitZone",
    descriptionEn: "Discount code from FitZone staff",
    discountAmount,
  });

}
