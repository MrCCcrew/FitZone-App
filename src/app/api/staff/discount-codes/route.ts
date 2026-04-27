import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

const MONTHLY_LIMIT = 12;

async function getStaffOrError() {
  const user = await getCurrentAppUser();
  if (!user?.id) return { error: NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 }) };
  if (user.role !== "staff" && user.role !== "admin") {
    return { error: NextResponse.json({ error: "هذا الحساب غير مصرح له بإنشاء أكواد خصم للموظفين." }, { status: 403 }) };
  }

  const staffUser = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      discountType: true,
      discountValue: true,
      maxDiscount: true,
      isActive: true,
    },
  });

  if (!staffUser || !staffUser.isActive) {
    return { error: NextResponse.json({ error: "هذا الحساب غير نشط." }, { status: 403 }) };
  }

  return { staffUser };
}

export async function GET() {
  const result = await getStaffOrError();
  if ("error" in result) return result.error;

  const codes = await db.staffDiscountCode.findMany({
    where: { staffUserId: result.staffUser.id },
    include: {
      targetUser: { select: { id: true, name: true, email: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    config: {
      discountType: result.staffUser.discountType,
      discountValue: result.staffUser.discountValue,
      maxDiscount: result.staffUser.maxDiscount,
    },
    codes,
  });
}

export async function POST(req: Request) {
  const result = await getStaffOrError();
  if ("error" in result) return result.error;

  const { staffUser } = result;
  const body = (await req.json()) as {
    targetUserId?: string;
    note?: string;
  };

  if (!body.targetUserId) {
    return NextResponse.json({ error: "يجب تحديد العميل المستهدف." }, { status: 400 });
  }

  if (!staffUser.discountValue || staffUser.discountValue <= 0) {
    return NextResponse.json({ error: "لم يحدد الأدمن قيمة خصم لهذا الموظف بعد." }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({
    where: { id: body.targetUserId },
    select: { id: true, role: true },
  });
  if (!targetUser || targetUser.role !== "member") {
    return NextResponse.json({ error: "العميل المحدد غير موجود." }, { status: 404 });
  }

  const monthYear = new Date().toISOString().slice(0, 7);
  const usedThisMonth = await db.staffDiscountCode.count({ where: { staffUserId: staffUser.id, monthYear } });
  if (usedThisMonth >= MONTHLY_LIMIT) {
    return NextResponse.json(
      { error: `لقد استنفدت حصتك لهذا الشهر (${MONTHLY_LIMIT} كود/شهر).` },
      { status: 400 },
    );
  }

  let code = "";
  for (let i = 0; i < 10; i++) {
    const candidate = `SDC-${randomBytes(3).toString("hex").toUpperCase()}`;
    const exists = await db.staffDiscountCode.findUnique({ where: { code: candidate } });
    if (!exists) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return NextResponse.json({ error: "تعذر إنشاء كود فريد، حاول مرة أخرى." }, { status: 500 });
  }

  const created = await db.staffDiscountCode.create({
    data: {
      staffUserId: staffUser.id,
      code,
      targetUserId: body.targetUserId,
      discountType: staffUser.discountType,
      discountValue: staffUser.discountValue,
      maxDiscount: staffUser.discountType === "percentage" ? staffUser.maxDiscount ?? null : null,
      note: body.note?.trim() || null,
      monthYear,
    },
    include: {
      targetUser: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  return NextResponse.json({ success: true, code: created.code, discount: created }, { status: 201 });
}
