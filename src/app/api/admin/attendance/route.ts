import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import {
  ensureMembershipAttendancePass,
  ensurePrivateAttendancePass,
  extractAttendanceCode,
  getPrivateSessionsRemaining,
  isMembershipEligibleForAttendance,
  isPrivateApplicationEligibleForAttendance,
} from "@/lib/attendance";

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

function parseRequestedDate(raw: string | null) {
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function GET(req: Request) {
  const guard = await requireAdminFeature("bookings");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") === "private" ? "private" : "class";
  const scheduleId = searchParams.get("scheduleId") || "";
  const selectedDate = parseRequestedDate(searchParams.get("date"));
  const from = startOfDay(selectedDate);
  const to = endOfDay(selectedDate);

  const [schedules, checkIns] = await Promise.all([
    db.schedule.findMany({
      where: { isActive: true, date: { gte: from, lte: to } },
      include: {
        class: { include: { trainer: true } },
        bookings: { select: { id: true, status: true } },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      take: 100,
    }),
    db.attendanceCheckIn.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(mode === "private"
          ? { privateSessionApplicationId: { not: null } }
          : { bookingId: { not: null } }),
        ...(scheduleId ? { scheduleId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        pass: { select: { label: true, kind: true } },
        scannedBy: { select: { id: true, name: true, email: true } },
        booking: {
          include: {
            schedule: {
              include: {
                class: { include: { trainer: true } },
              },
            },
          },
        },
        privateSessionApplication: {
          include: {
            trainer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    schedules: schedules.map((schedule) => ({
      id: schedule.id,
      date: schedule.date.toISOString(),
      time: schedule.time,
      availableSpots: schedule.availableSpots,
      confirmedCount: schedule.bookings.filter((booking) => booking.status === "confirmed").length,
      attendedCount: schedule.bookings.filter((booking) => booking.status === "attended").length,
      class: {
        id: schedule.class.id,
        name: schedule.class.name,
        trainerName: schedule.class.trainer.name,
      },
    })),
    checkIns: checkIns.map((checkIn) => ({
      id: checkIn.id,
      createdAt: checkIn.createdAt.toISOString(),
      checkInType: checkIn.checkInType,
      notes: checkIn.notes ?? null,
      user: {
        id: checkIn.user.id,
        name: checkIn.user.name ?? "Member",
        email: checkIn.user.email ?? "",
        phone: checkIn.user.phone ?? "",
      },
      passLabel: checkIn.pass.label ?? null,
      scannedBy: checkIn.scannedBy
        ? {
            id: checkIn.scannedBy.id,
            name: checkIn.scannedBy.name ?? checkIn.scannedBy.email ?? "Staff",
          }
        : null,
      booking: checkIn.booking
        ? {
            id: checkIn.booking.id,
            className: checkIn.booking.schedule.class.name,
            trainerName: checkIn.booking.schedule.class.trainer.name,
            date: checkIn.booking.schedule.date.toISOString(),
            time: checkIn.booking.schedule.time,
          }
        : null,
      privateSession: checkIn.privateSessionApplication
        ? {
            id: checkIn.privateSessionApplication.id,
            type: checkIn.privateSessionApplication.type,
            trainerName: checkIn.privateSessionApplication.trainer.name,
          }
        : null,
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("bookings");
  if ("error" in guard) return guard.error;

  const body = (await req.json().catch(() => ({}))) as {
    scanValue?: string;
    scheduleId?: string | null;
    mode?: "class" | "private";
  };

  const code = extractAttendanceCode(body.scanValue);
  const mode = body.mode === "private" ? "private" : "class";

  if (!code) {
    return NextResponse.json({ error: "كود الحضور غير صالح." }, { status: 400 });
  }

  const pass = await db.attendancePass.findUnique({
    where: { code },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
      userMembership: { include: { membership: true } },
      privateSessionApplication: {
        include: {
          trainer: { select: { id: true, name: true } },
          attendanceCheckIns: { select: { id: true } },
        },
      },
    },
  });

  if (!pass || pass.status !== "active" || !pass.user.isActive) {
    return NextResponse.json({ error: "هذا الكود غير متاح للحضور." }, { status: 404 });
  }

  if (pass.userMembership) {
    if (mode !== "class") {
      return NextResponse.json({ error: "هذا الكود خاص بحضور الكلاسات فقط." }, { status: 400 });
    }
    if (!body.scheduleId) {
      return NextResponse.json({ error: "يجب اختيار الكلاس أو الموعد قبل المسح." }, { status: 400 });
    }
    if (!isMembershipEligibleForAttendance(pass.userMembership)) {
      return NextResponse.json({ error: "هذا الاشتراك غير مؤهل للحضور بالمسح." }, { status: 400 });
    }

    const booking = await db.booking.findFirst({
      where: {
        userId: pass.userId,
        userMembershipId: pass.userMembership.id,
        scheduleId: body.scheduleId,
        status: { in: ["confirmed", "attended"] },
      },
      include: {
        schedule: {
          include: {
            class: { include: { trainer: true } },
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "لا يوجد حجز مطابق لهذا العميل في هذا الكلاس." }, { status: 404 });
    }

    if (booking.status === "attended") {
      return NextResponse.json({
        success: true,
        alreadyCheckedIn: true,
        result: {
          type: "class",
          customerName: pass.user.name ?? "Member",
          className: booking.schedule.class.name,
          trainerName: booking.schedule.class.trainer.name,
          time: booking.schedule.time,
        },
      });
    }

    const checkIn = await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "attended" },
      });

      const created = await tx.attendanceCheckIn.create({
        data: {
          passId: pass.id,
          userId: pass.userId,
          userMembershipId: pass.userMembership!.id,
          bookingId: booking.id,
          scheduleId: booking.scheduleId,
          scannedByUserId: guard.session.user.id,
          checkInType: "class",
        },
      });

      await tx.attendancePass.update({
        where: { id: pass.id },
        data: { lastUsedAt: new Date() },
      });

      await tx.notification.create({
        data: {
          userId: pass.userId,
          title: `تم تسجيل حضور ${booking.schedule.class.name}`,
          body: `تم تسجيل حضورك في ${booking.schedule.class.name} الساعة ${booking.schedule.time}.`,
          type: "success",
        },
      }).catch(() => null);

      return created;
    });

    return NextResponse.json({
      success: true,
      result: {
        id: checkIn.id,
        type: "class",
        customerName: pass.user.name ?? "Member",
        className: booking.schedule.class.name,
        trainerName: booking.schedule.class.trainer.name,
        time: booking.schedule.time,
      },
    });
  }

  if (!pass.privateSessionApplication) {
    return NextResponse.json({ error: "تعذر تحديد نوع الحضور لهذا الكود." }, { status: 400 });
  }

  if (mode !== "private") {
    return NextResponse.json({ error: "هذا الكود خاص بالبرايفيت أو الميني برايفيت." }, { status: 400 });
  }

  if (!isPrivateApplicationEligibleForAttendance(pass.privateSessionApplication)) {
    return NextResponse.json({ error: "هذا الطلب غير مؤهل للحضور بعد." }, { status: 400 });
  }

  const usedCount = pass.privateSessionApplication.attendanceCheckIns.length;
  const remainingBefore = getPrivateSessionsRemaining(usedCount);

  if (remainingBefore <= 0) {
    await db.attendancePass.update({
      where: { id: pass.id },
      data: { status: "expired" },
    }).catch(() => null);

    return NextResponse.json({ error: "تم استهلاك كل الجلسات المتاحة لهذا الطلب." }, { status: 400 });
  }

  const checkIn = await db.$transaction(async (tx) => {
    const created = await tx.attendanceCheckIn.create({
      data: {
        passId: pass.id,
        userId: pass.userId,
        privateSessionApplicationId: pass.privateSessionApplication!.id,
        scannedByUserId: guard.session.user.id,
        checkInType: pass.privateSessionApplication!.type === "mini_private" ? "mini_private" : "private",
      },
    });

    await tx.attendancePass.update({
      where: { id: pass.id },
      data: {
        lastUsedAt: new Date(),
        status: remainingBefore - 1 <= 0 ? "expired" : "active",
      },
    });

    await tx.notification.create({
      data: {
        userId: pass.userId,
        title:
          pass.privateSessionApplication!.type === "mini_private"
            ? "تم تسجيل حضور جلسة ميني برايفيت"
            : "تم تسجيل حضور جلسة برايفيت",
        body: `تم تسجيل حضورك مع المدربة ${pass.privateSessionApplication!.trainer.name}.`,
        type: "success",
      },
    }).catch(() => null);

    return created;
  });

  return NextResponse.json({
    success: true,
    result: {
      id: checkIn.id,
      type: pass.privateSessionApplication.type,
      customerName: pass.user.name ?? "Member",
      trainerName: pass.privateSessionApplication.trainer.name,
      remainingSessions: remainingBefore - 1,
    },
  });
}
