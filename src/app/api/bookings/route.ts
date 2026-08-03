import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { isBookingOperational } from "@/lib/booking-operational";
import { canMembershipBookClass, resolveMembershipClassEligibility } from "@/lib/membership-class-eligibility";

function membershipAllowsClass(membership: { allowedClassTypesSnapshot: string | null; membership: { classSessions: string | null } | null }, gymClass: { id: string; type: string | null }) {
  if (membership.allowedClassTypesSnapshot != null) {
    try {
      const allowed = JSON.parse(membership.allowedClassTypesSnapshot) as unknown;
      if (Array.isArray(allowed)) {
        const types = new Set(allowed.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
        return types.size === 0 || types.has((gymClass.type ?? "").trim().toLowerCase());
      }
    } catch { /* legacy fallback below */ }
  }
  if (!membership.membership?.classSessions) return true;
  try {
    const entries = JSON.parse(membership.membership.classSessions) as Array<{ classId: string; classType?: string }>;
    if (!entries.length) return true;
    const type = (gymClass.type ?? "").trim().toLowerCase();
    return entries.some((entry) => entry.classId === gymClass.id || entry.classId === type || entry.classType?.trim().toLowerCase() === type);
  } catch { return true; }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
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

    const now = new Date();
    const activeMemberships = await db.userMembership.findMany({
      where: { userId, status: "active", startDate: { lte: now }, endDate: { gte: now } },
      orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
      include: { membership: { select: { classSessions: true } } },
    });
    const eligibility = await resolveMembershipClassEligibility({ userId, classes: [schedule.class], now, memberships: activeMemberships });
    if (!eligibility.hasEligibleMembership) {
      return NextResponse.json({ error: "لا توجد عضوية فعالة للحجز.", code: "NO_ELIGIBLE_MEMBERSHIP" }, { status: 400 });
    }
    if (!eligibility.unrestricted && !eligibility.allowedClassIds.includes(schedule.class.id)) {
      return NextResponse.json({ error: "هذا الكلاس غير مشمول ضمن العرض المشترك به.", code: "CLASS_NOT_INCLUDED_IN_MEMBERSHIP" }, { status: 400 });
    }
    // The earliest-expiring eligible membership wins deterministically, so a
    // booking never consumes sessions from an arbitrary active membership.
    const activeMembership = activeMemberships.find((membership) => membershipAllowsClass(membership, schedule.class)) ?? null;

    if (activeMembership && activeMembership.totalSessions !== null && activeMembership.totalSessions > 0) {
      const usedBookings = await db.booking.count({
        where: {
          userMembershipId: activeMembership.id,
          status: { in: ["confirmed", "attended"] },
        },
      });
      if (usedBookings >= activeMembership.totalSessions) {
        return NextResponse.json({ error: "لقد استنفدتِ جميع حصص اشتراكك." }, { status: 400 });
      }
    }

    const booking = await db.booking.create({
      data: {
        userId,
        scheduleId,
        userMembershipId: activeMembership?.id ?? null,
        status: "confirmed",
        paidAmount: schedule.class.price,
        paymentMethod: activeMembership?.id ? "membership" : "paymob",
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
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const { bookingId, scheduleId } = (await req.json()) as { bookingId?: string; scheduleId?: string };
    if (!bookingId) {
      return NextResponse.json({ error: "الحجز المطلوب غير محدد" }, { status: 400 });
    }

    const booking = await db.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        userMembership: { select: { status: true } },
        schedule: { include: { class: true } },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });
    }

    // Check operational status
    if (!isBookingOperational(booking)) {
      return NextResponse.json(
        { error: "لا يمكن تعديل حجز مرتبط باشتراك غير نشط" },
        { status: 400 }
      );
    }

    if (booking.status !== "confirmed") {
      return NextResponse.json({ error: "لا يمكن تعديل هذا الحجز" }, { status: 400 });
    }

    const currentSlot = new Date(booking.schedule.date);
    const [currentHour, currentMinute] = booking.schedule.time.split(":").map((n) => Number(n));
    currentSlot.setHours(Number.isNaN(currentHour) ? 0 : currentHour, Number.isNaN(currentMinute) ? 0 : currentMinute, 0, 0);
    const now = new Date();
    if (currentSlot <= now) {
      return NextResponse.json({ error: "انتهى موعد هذا الحجز ولا يمكن تعديله" }, { status: 400 });
    }
    if (currentSlot.getTime() - now.getTime() < 4 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "لا يمكن تعديل الموعد قبل أقل من 4 ساعات من بدايته" }, { status: 400 });
    }

    if (scheduleId) {
      if (scheduleId === booking.scheduleId) {
        return NextResponse.json({ error: "هذا هو الموعد الحالي بالفعل" }, { status: 400 });
      }

      const newSchedule = await db.schedule.findUnique({
        where: { id: scheduleId },
        include: { class: true },
      });

      if (!newSchedule || !newSchedule.isActive) {
        return NextResponse.json({ error: "الموعد الجديد غير متاح" }, { status: 404 });
      }

      if (newSchedule.availableSpots <= 0) {
        return NextResponse.json({ error: "لا توجد أماكن متاحة لهذا الموعد" }, { status: 400 });
      }

      // Resolve class eligibility from every currently valid membership.
      const activeMemberships = await db.userMembership.findMany({
        where: { userId, status: "active", startDate: { lte: now }, endDate: { gte: now } },
        orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
        include: { membership: { select: { classSessions: true } } },
      });
      const eligibility = await resolveMembershipClassEligibility({
        userId,
        classes: [newSchedule.class],
        now,
        memberships: activeMemberships,
      });
      if (!eligibility.hasEligibleMembership) {
        return NextResponse.json({ error: "لا توجد عضوية فعالة للحجز.", code: "NO_ELIGIBLE_MEMBERSHIP" }, { status: 400 });
      }
      if (!eligibility.unrestricted && !eligibility.allowedClassIds.includes(newSchedule.class.id)) {
        return NextResponse.json({ error: "هذا الكلاس غير مشمول ضمن العرض المشترك به.", code: "CLASS_NOT_INCLUDED_IN_MEMBERSHIP" }, { status: 400 });
      }

      const currentMembership = activeMemberships.find((membership) => membership.id === booking.userMembershipId);
      // Keep the current membership when it still covers the class; otherwise
      // choose the earliest-expiring eligible membership that does.
      const targetMembership = currentMembership && canMembershipBookClass(currentMembership, newSchedule.class)
        ? currentMembership
        : activeMemberships.find((membership) => canMembershipBookClass(membership, newSchedule.class));

      await db.$transaction([
        db.booking.update({
          where: { id: bookingId },
          data: { scheduleId: newSchedule.id, userMembershipId: targetMembership?.id ?? booking.userMembershipId },
        }),
        db.schedule.update({
          where: { id: booking.scheduleId },
          data: { availableSpots: { increment: 1 } },
        }),
        db.schedule.update({
          where: { id: newSchedule.id },
          data: { availableSpots: { decrement: 1 } },
        }),
        db.notification.create({
          data: {
            userId,
            title: `تم تعديل موعد ${newSchedule.class.name}`,
            body: `تم تحديث الموعد إلى ${newSchedule.time} بتاريخ ${newSchedule.date.toLocaleDateString("ar-EG")}.`,
            type: "info",
          },
        }),
      ]);

      // Notify all admins about the schedule change
      const [admins, member] = await Promise.all([
        db.user.findMany({ where: { role: "admin" }, select: { id: true } }),
        db.user.findUnique({ where: { id: userId }, select: { name: true } }),
      ]);
      if (admins.length > 0) {
        await Promise.all(
          admins.map((admin) =>
            db.notification.create({
              data: {
                userId: admin.id,
                title: "⚠️ تغيير موعد من عضو",
                body: `${member?.name ?? "عضو"} غيّر موعد كلاس "${newSchedule.class.name}" إلى ${newSchedule.time} بتاريخ ${newSchedule.date.toLocaleDateString("ar-EG")}`,
                type: "warning",
              },
            }),
          ),
        );
      }

      return NextResponse.json({ success: true });
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
    return NextResponse.json({ error: "تعذر تنفيذ العملية على الحجز" }, { status: 500 });
  }
}
