import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";
import { buildAttendancePayload } from "@/lib/attendance";
import { generateMembershipQrCard } from "@/lib/membership-card";
import { sendGiftTrialEmail } from "@/lib/email";

const GIFT_MEMBERSHIP_NAME = "حصة تجريبية مجانية";

async function getOrCreateGiftMembership() {
  const existing = await db.membership.findFirst({
    where: { name: GIFT_MEMBERSHIP_NAME, kind: "trial" },
  });
  if (existing) return existing;

  return db.membership.create({
    data: {
      name: GIFT_MEMBERSHIP_NAME,
      nameEn: "Free Gift Trial Session",
      kind: "trial",
      price: 0,
      duration: 1,
      features: JSON.stringify(["حصة مجانية من الإدارة"]),
      isActive: false,
      sortOrder: 999,
    },
  });
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("bookings");
  if ("error" in guard) return guard.error;

  // If the sender is a trainer, check gift permissions and monthly limit
  if (guard.role === "trainer") {
    const trainerProfile = await db.trainer.findFirst({
      where: { userId: guard.session.user.id },
      select: { id: true, canSendGifts: true, giftMonthlyLimit: true },
    });
    if (!trainerProfile || !trainerProfile.canSendGifts) {
      return NextResponse.json({ error: "ليس لديك صلاحية إرسال كلاسات هدية." }, { status: 403 });
    }
    // Count gifts sent this calendar month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const sentThisMonth = await db.userMembership.count({
      where: {
        paymentMethod: "gift",
        startDate: { gte: monthStart, lt: monthEnd },
        // Track by the schedule's trainer
        bookings: {
          some: {
            schedule: { class: { trainerId: trainerProfile.id } },
          },
        },
      },
    });
    if (sentThisMonth >= trainerProfile.giftMonthlyLimit) {
      return NextResponse.json(
        { error: `لقد وصلت للحد الأقصى من الكلاسات الهدية هذا الشهر (${trainerProfile.giftMonthlyLimit}).` },
        { status: 429 },
      );
    }
  }

  const body = await req.json().catch(() => ({})) as {
    customerId?: string;
    scheduleId?: string;
    note?: string;
  };

  const { customerId, scheduleId, note } = body;
  if (!customerId || !scheduleId) {
    return NextResponse.json({ error: "يجب اختيار العميل والموعد" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "العميل غير موجود أو غير نشط" }, { status: 404 });
  }

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { class: { include: { trainer: true } } },
  });
  if (!schedule) {
    return NextResponse.json({ error: "الموعد غير موجود" }, { status: 404 });
  }

  const existing = await db.booking.findFirst({
    where: { userId: customerId, scheduleId, status: { in: ["confirmed", "attended"] } },
  });
  if (existing) {
    return NextResponse.json({ error: "هذا العميل لديه حجز مسبق في هذا الموعد" }, { status: 400 });
  }

  const giftMembership = await getOrCreateGiftMembership();

  const scheduleDate = new Date(schedule.date);
  const endDate = new Date(scheduleDate);
  endDate.setDate(endDate.getDate() + 1);

  const code = randomBytes(18).toString("base64url");
  const qrPayload = buildAttendancePayload(code);
  const cardCode = code.slice(0, 8).toUpperCase();

  const { userMembership } = await db.$transaction(async (tx) => {
    const um = await tx.userMembership.create({
      data: {
        userId: customerId,
        membershipId: giftMembership.id,
        startDate: scheduleDate,
        endDate,
        status: "active",
        paymentAmount: 0,
        paymentMethod: "gift",
        totalSessions: 1,
        offerTitle: `هدية مجانية من الإدارة — ${schedule.class.name}`,
      },
    });

    await tx.booking.create({
      data: {
        userId: customerId,
        scheduleId,
        userMembershipId: um.id,
        status: "confirmed",
        paidAmount: 0,
        paymentMethod: "gift",
      },
    });

    await tx.attendancePass.create({
      data: {
        userId: customerId,
        userMembershipId: um.id,
        code,
        kind: "membership",
        status: "active",
        label: `هدية تجريبية — ${schedule.class.name}`,
      },
    });

    await tx.notification.create({
      data: {
        userId: customerId,
        title: "🎁 حصة تجريبية مجانية!",
        body: `أرسلت إليكِ الإدارة حصة تجريبية مجانية في ${schedule.class.name} — تحققي من بريدك الإلكتروني للحصول على الكارت.`,
        type: "success",
      },
    }).catch(() => null);

    return { userMembership: um };
  });

  void logAudit({
    action: "gift_trial",
    targetType: "userMembership",
    targetId: userMembership.id,
    details: {
      customerId,
      customerName: user.name,
      scheduleId,
      className: schedule.class.name,
      note: note ?? null,
    },
  });

  let membershipCard = null;
  let qrPngBuffer: Buffer | null = null;
  try {
    membershipCard = await generateMembershipQrCard({
      memberName: user.name ?? "عميلتنا",
      membershipName: "حصة تجريبية مجانية",
      offerTitle: `هدية الإدارة — ${schedule.class.name}`,
      endDate,
      qrPayload,
      cardCode,
    });
    // Generate standalone QR as PNG for inline CID embedding in email
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2, errorCorrectionLevel: "M" });
    qrPngBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  } catch (err) {
    console.error("[GIFT_QR_CARD]", err);
  }

  if (user.email) {
    try {
      await sendGiftTrialEmail({
        email: user.email,
        name: user.name ?? "عميلتنا العزيزة",
        className: schedule.class.name,
        trainerName: schedule.class.trainer.name,
        scheduleDate,
        scheduleTime: schedule.time,
        note: note ?? null,
        membershipCard,
        qrPngBuffer,
      });
    } catch (err) {
      console.error("[GIFT_EMAIL]", err);
    }
  }

  return NextResponse.json({ success: true, userMembershipId: userMembership.id });
}
