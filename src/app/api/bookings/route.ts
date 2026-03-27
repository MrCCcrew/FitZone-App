import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا" }, { status: 401 });
    }

    const { scheduleId } = (await req.json()) as { scheduleId?: string };
    if (!scheduleId) {
      return NextResponse.json({ error: "موعد الحجز مطلوب" }, { status: 400 });
    }

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { class: { include: { trainer: true } } },
    });

    if (!schedule || !schedule.isActive) {
      return NextResponse.json({ error: "هذا الموعد غير متاح" }, { status: 404 });
    }

    if (schedule.availableSpots <= 0) {
      return NextResponse.json({ error: "لا توجد أماكن متاحة لهذا الموعد" }, { status: 400 });
    }

    const existing = await db.booking.findFirst({
      where: {
        userId,
        scheduleId,
        status: { in: ["confirmed", "attended"] },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "تم حجز هذا الموعد مسبقًا" }, { status: 409 });
    }

    const booking = await db.booking.create({
      data: {
        userId,
        scheduleId,
        status: "confirmed",
        paidAmount: schedule.class.price,
        paymentMethod: "manual_pending",
      },
    });

    await Promise.all([
      db.schedule.update({
        where: { id: scheduleId },
        data: { availableSpots: { decrement: 1 } },
      }),
      db.notification.create({
        data: {
          userId,
          title: `تم حجز ${schedule.class.name}`,
          body: `تم حجز موعد ${schedule.time} بتاريخ ${schedule.date.toLocaleDateString("ar-EG")} بنجاح.`,
          type: "success",
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      message: "تم تأكيد الحجز بنجاح.",
    });
  } catch (error) {
    console.error("[BOOKINGS_POST]", error);
    return NextResponse.json({ error: "تعذر إتمام الحجز" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا" }, { status: 401 });
    }

    const { bookingId } = (await req.json()) as { bookingId?: string };
    if (!bookingId) {
      return NextResponse.json({ error: "الحجز المطلوب غير محدد" }, { status: 400 });
    }

    const booking = await db.booking.findFirst({
      where: { id: bookingId, userId },
      include: { schedule: { include: { class: true } } },
    });

    if (!booking) {
      return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });
    }

    if (booking.status !== "confirmed") {
      return NextResponse.json({ error: "لا يمكن إلغاء هذا الحجز" }, { status: 400 });
    }

    await Promise.all([
      db.booking.update({
        where: { id: bookingId },
        data: { status: "cancelled" },
      }),
      db.schedule.update({
        where: { id: booking.scheduleId },
        data: { availableSpots: { increment: 1 } },
      }),
      db.notification.create({
        data: {
          userId,
          title: `تم إلغاء حجز ${booking.schedule.class.name}`,
          body: "تم إلغاء الحجز بنجاح وإعادة المقعد إلى الجدول.",
          type: "info",
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[BOOKINGS_PATCH]", error);
    return NextResponse.json({ error: "تعذر إلغاء الحجز" }, { status: 500 });
  }
}
