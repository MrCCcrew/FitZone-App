import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

// GET /api/admin/trainer-attendance?trainerId=X&month=YYYY-MM
export async function GET(req: NextRequest) {
  const auth = await requireAdminFeature("trainers");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const trainerId = searchParams.get("trainerId");
  const month = searchParams.get("month"); // "2025-06"

  const where: Record<string, unknown> = {};
  if (trainerId) where.trainerId = trainerId;
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    where.date = { gte: start, lt: end };
  }

  const logs = await (db as any).trainerAttendanceLog.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      trainer: { select: { id: true, name: true, image: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ logs });
}

// Legacy daily trainer attendance is historical/read-only.
// New coach attendance mutations must use /api/admin/coach-class-attendance.
export async function POST(_req: NextRequest) {
  const auth = await requireAdminFeature("trainers");

  if ("error" in auth) return auth.error;

  return NextResponse.json(
    {
      error:
        "نظام حضور المدربين القديم أصبح للقراءة التاريخية فقط. استخدم حضور المدربين للحصص.",
      code: "LEGACY_TRAINER_ATTENDANCE_READ_ONLY",
    },
    {
      status: 410,
    },
  );
}

// Historical records are intentionally preserved.
// Deletion through the legacy attendance endpoint is disabled.
export async function DELETE(_req: NextRequest) {
  const auth = await requireAdminFeature("trainers");

  if ("error" in auth) return auth.error;

  return NextResponse.json(
    {
      error:
        "سجلات حضور المدربين القديمة محفوظة تاريخيًا ولا يمكن حذفها من النظام القديم.",
      code: "LEGACY_TRAINER_ATTENDANCE_READ_ONLY",
    },
    {
      status: 410,
    },
  );
}
