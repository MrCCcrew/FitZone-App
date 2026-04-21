import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

const MONTHLY_LIMIT = 4;

async function getTrainerOrError() {
  const user = await getCurrentAppUser();
  if (!user?.id) return { error: NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 }) };

  const trainer = await db.trainer.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!trainer) return { error: NextResponse.json({ error: "هذا الحساب غير مرتبط بمدربة." }, { status: 403 }) };

  return { userId: user.id, trainerId: trainer.id };
}

export async function GET() {
  const result = await getTrainerOrError();
  if ("error" in result) return result.error;

  const codes = await db.trainerDiscountCode.findMany({
    where: { trainerId: result.trainerId },
    include: {
      targetUser: { select: { id: true, name: true, email: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ codes });
}

export async function POST(req: Request) {
  const result = await getTrainerOrError();
  if ("error" in result) return result.error;
  const { trainerId } = result;

  const body = (await req.json()) as {
    targetUserId?: string;
    discountType?: string;
    discountValue?: number;
    maxDiscount?: number;
    note?: string;
  };

  if (!body.targetUserId) return NextResponse.json({ error: "يجب تحديد العميل المستهدف." }, { status: 400 });
  if (!body.discountValue || body.discountValue <= 0)
    return NextResponse.json({ error: "قيمة الخصم يجب أن تكون أكبر من صفر." }, { status: 400 });

  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  if (discountType === "percentage" && body.discountValue > 100)
    return NextResponse.json({ error: "نسبة الخصم يجب أن تكون بين 1 و 100." }, { status: 400 });

  // Check target user exists
  const targetUser = await db.user.findUnique({ where: { id: body.targetUserId }, select: { id: true } });
  if (!targetUser) return NextResponse.json({ error: "العميل المحدد غير موجود." }, { status: 404 });

  // Monthly limit check
  const monthYear = new Date().toISOString().slice(0, 7); // "2026-04"
  const usedThisMonth = await db.trainerDiscountCode.count({ where: { trainerId, monthYear } });
  if (usedThisMonth >= MONTHLY_LIMIT)
    return NextResponse.json(
      { error: `لقد استنفدت حصتك لهذا الشهر (${MONTHLY_LIMIT} أكواد/شهر). تجديد الحصة أول الشهر القادم.` },
      { status: 400 },
    );

  // Generate unique code
  let code = "";
  for (let i = 0; i < 10; i++) {
    const candidate = `TDC-${randomBytes(3).toString("hex").toUpperCase()}`;
    const exists = await db.trainerDiscountCode.findUnique({ where: { code: candidate } });
    if (!exists) { code = candidate; break; }
  }
  if (!code) return NextResponse.json({ error: "تعذر إنشاء كود فريد، حاول مرة أخرى." }, { status: 500 });

  const created = await db.trainerDiscountCode.create({
    data: {
      trainerId,
      code,
      targetUserId: body.targetUserId,
      discountType,
      discountValue: body.discountValue,
      maxDiscount: body.maxDiscount ?? null,
      note: body.note?.trim() ?? null,
      monthYear,
    },
    include: {
      targetUser: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  return NextResponse.json({ success: true, code: created.code, discount: created }, { status: 201 });
}
