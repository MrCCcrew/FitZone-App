import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function checkAdmin() {
  const guard = await requireAdminFeature("bookings");
  return "error" in guard ? guard.error : null;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export async function GET(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const q = (searchParams.get("q") || "").trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;

  if (dateFrom || dateTo) {
    const fromDate = dateFrom ? startOfDay(new Date(dateFrom)) : undefined;
    const toDate = dateTo ? endOfDay(new Date(dateTo)) : undefined;
    where.schedule = {
      date: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
    };
  }

  if (q) {
    where.OR = [
      { user: { name: { contains: q } } },
      { user: { email: { contains: q } } },
      { user: { phone: { contains: q } } },
      { schedule: { class: { name: { contains: q } } } },
    ];
  }

  const bookings = await db.booking.findMany({
    where,
    include: {
      user: true,
      schedule: { include: { class: { include: { trainer: true } } } },
      userMembership: { include: { membership: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });

  return NextResponse.json(
    bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      paidAmount: booking.paidAmount,
      paymentMethod: booking.paymentMethod,
      createdAt: booking.createdAt.toISOString(),
      user: {
        id: booking.user.id,
        name: booking.user.name ?? "—",
        email: booking.user.email ?? "—",
        phone: booking.user.phone ?? "—",
      },
      schedule: {
        id: booking.schedule.id,
        date: booking.schedule.date.toISOString(),
        time: booking.schedule.time,
        availableSpots: booking.schedule.availableSpots,
        class: {
          id: booking.schedule.class.id,
          name: booking.schedule.class.name,
          trainer: booking.schedule.class.trainer.name,
        },
      },
      membership: booking.userMembership
        ? {
            id: booking.userMembership.id,
            name: booking.userMembership.membership.name,
            status: booking.userMembership.status,
          }
        : null,
    })),
  );
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const payload = (await req.json()) as {
      userId?: string;
      scheduleId?: string;
      paymentMethod?: string;
    };

    if (!payload.userId || !payload.scheduleId) {
      return NextResponse.json({ error: "المستخدم والموعد مطلوبان." }, { status: 400 });
    }

    const schedule = await db.schedule.findUnique({
      where: { id: payload.scheduleId },
      include: { class: true },
    });

    if (!schedule || !schedule.isActive) {
      return NextResponse.json({ error: "الموعد غير متاح." }, { status: 404 });
    }

    if (schedule.availableSpots <= 0) {
      return NextResponse.json({ error: "لا توجد أماكن متاحة لهذا الموعد." }, { status: 400 });
    }

    const activeMembership = await db.userMembership.findFirst({
      where: { userId: payload.userId, status: "active" },
      orderBy: { startDate: "desc" },
    });

    const booking = await db.booking.create({
      data: {
        userId: payload.userId,
        scheduleId: payload.scheduleId,
        userMembershipId: activeMembership?.id ?? null,
        status: "confirmed",
        paidAmount: schedule.class.price,
        paymentMethod: payload.paymentMethod ?? "manual_pending",
      },
    });

    await db.schedule.update({
      where: { id: payload.scheduleId },
      data: { availableSpots: { decrement: 1 } },
    });

    await db.notification.create({
      data: {
        userId: payload.userId,
        title: `تم حجز ${schedule.class.name}`,
        body: `تم إضافة حجز بواسطة الإدارة لميعاد ${schedule.time} بتاريخ ${schedule.date.toLocaleDateString("ar-EG")}.`,
        type: "success",
      },
    });

    return NextResponse.json({ success: true, bookingId: booking.id });
  } catch (error) {
    console.error("[ADMIN_BOOKINGS_POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء الحجز." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const payload = (await req.json()) as {
      bookingId?: string;
      action?: "attended" | "cancel" | "confirm" | "reschedule";
      scheduleId?: string;
    };

    if (!payload.bookingId || !payload.action) {
      return NextResponse.json({ error: "بيانات الحجز غير مكتملة." }, { status: 400 });
    }

    const booking = await db.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        schedule: { include: { class: true } },
        user: true,
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "الحجز غير موجود." }, { status: 404 });
    }

    if (payload.action === "cancel") {
      if (booking.status === "cancelled") {
        return NextResponse.json({ success: true });
      }

      await db.booking.update({
        where: { id: booking.id },
        data: { status: "cancelled" },
      });

      await db.schedule.update({
        where: { id: booking.scheduleId },
        data: { availableSpots: { increment: 1 } },
      });

      await db.notification.create({
        data: {
          userId: booking.userId,
          title: `تم إلغاء حجز ${booking.schedule.class.name}`,
          body: "تم إلغاء الحجز بواسطة الإدارة وإعادة المقعد إلى الجدول.",
          type: "info",
        },
      });

      return NextResponse.json({ success: true });
    }

    if (payload.action === "attended") {
      await db.booking.update({
        where: { id: booking.id },
        data: { status: "attended" },
      });

      await db.notification.create({
        data: {
          userId: booking.userId,
          title: `تم تسجيل حضور ${booking.schedule.class.name}`,
          body: "تم تسجيل حضورك بواسطة الإدارة.",
          type: "success",
        },
      });

      return NextResponse.json({ success: true });
    }

    if (payload.action === "confirm") {
      await db.booking.update({
        where: { id: booking.id },
        data: { status: "confirmed" },
      });
      return NextResponse.json({ success: true });
    }

    if (payload.action === "reschedule") {
      if (!payload.scheduleId) {
        return NextResponse.json({ error: "الميعاد الجديد مطلوب." }, { status: 400 });
      }

      const newSchedule = await db.schedule.findUnique({
        where: { id: payload.scheduleId },
        include: { class: true },
      });

      if (!newSchedule || !newSchedule.isActive) {
        return NextResponse.json({ error: "الميعاد الجديد غير متاح." }, { status: 404 });
      }

      if (newSchedule.availableSpots <= 0) {
        return NextResponse.json({ error: "لا توجد أماكن متاحة في الموعد الجديد." }, { status: 400 });
      }

      await db.booking.update({
        where: { id: booking.id },
        data: { scheduleId: newSchedule.id, status: "confirmed" },
      });

      await Promise.all([
        db.schedule.update({
          where: { id: booking.scheduleId },
          data: { availableSpots: { increment: 1 } },
        }),
        db.schedule.update({
          where: { id: newSchedule.id },
          data: { availableSpots: { decrement: 1 } },
        }),
      ]);

      await db.notification.create({
        data: {
          userId: booking.userId,
          title: `تم تعديل ميعاد ${newSchedule.class.name}`,
          body: `تم تعديل الموعد إلى ${newSchedule.time} بتاريخ ${newSchedule.date.toLocaleDateString("ar-EG")}.`,
          type: "info",
        },
      });

      return NextResponse.json({ success: true });
    }

    void logAudit({ action: payload.action, targetType: "booking", targetId: payload.bookingId, details: { userId: booking.userId, className: booking.schedule.class.name } });
    return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
  } catch (error) {
    console.error("[ADMIN_BOOKINGS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث الحجز." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const { bookingId } = (await req.json()) as { bookingId?: string };
    if (!bookingId) return NextResponse.json({ error: "معرّف الحجز مطلوب." }, { status: 400 });

    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return NextResponse.json({ error: "الحجز غير موجود." }, { status: 404 });

    await db.booking.delete({ where: { id: bookingId } });

    // Restore the spot only if the booking was holding one (not cancelled)
    if (booking.status !== "cancelled") {
      await db.schedule.update({
        where: { id: booking.scheduleId },
        data: { availableSpots: { increment: 1 } },
      });
    }

    void logAudit({ action: "delete", targetType: "booking", targetId: bookingId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_BOOKINGS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف الحجز." }, { status: 500 });
  }
}
