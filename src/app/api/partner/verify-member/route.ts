import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await db.partner.findUnique({
    where: { userId: guard.session.user.id },
    select: { id: true, memberBenefitCode: true, memberBenefitRate: true },
  });
  if (!partner) return NextResponse.json({ error: "ملف الشريك غير موجود." }, { status: 404 });
  if (!partner.memberBenefitCode) {
    return NextResponse.json({ error: "لا يوجد كود ميزة أعضاء مُعرّف لحسابك." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "أدخل رقم هاتف أو بريد إلكتروني." }, { status: 400 });

  const user = await db.user.findFirst({
    where: { OR: [{ email: q }, { phone: q }] },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!user) {
    return NextResponse.json({ found: false, message: "لا يوجد حساب مسجل بهذه البيانات." });
  }

  const now = new Date();
  const activeMembership = await db.userMembership.findFirst({
    where: {
      userId: user.id,
      status: "active",
      endDate: { gt: now },
    },
    include: { membership: { select: { name: true } } },
    orderBy: { endDate: "desc" },
  });

  const paidPrivateSession = await db.privateSessionApplication.findFirst({
    where: {
      userId: user.id,
      status: "paid",
      paidAt: { not: null },
    },
    select: { type: true, paidAt: true },
    orderBy: { paidAt: "desc" },
  });

  if (!activeMembership && !paidPrivateSession) {
    return NextResponse.json({
      found: true,
      name: user.name ?? user.email ?? "عميل",
      hasActiveMembership: false,
      message: "لا يوجد اشتراك/جلسة مدفوعة فعّالة لهذا العميل حالياً.",
    });
  }

  const membershipName = activeMembership
    ? activeMembership.membership?.name ?? null
    : paidPrivateSession
      ? (paidPrivateSession.type === "mini_private" ? "ميني برايفيت" : "برايفيت")
      : null;

  const endDate = activeMembership?.endDate
    ? activeMembership.endDate.toLocaleDateString("ar-EG")
    : (paidPrivateSession?.paidAt ? new Date(paidPrivateSession.paidAt).toLocaleDateString("ar-EG") : null);

  return NextResponse.json({
    found: true,
    name: user.name ?? user.email ?? "عميل",
    hasActiveMembership: true,
    membershipName,
    endDate,
    benefitRate: partner.memberBenefitRate,
    message: "✓ العميل مستحق لميزة الشريك.",
  });
}

