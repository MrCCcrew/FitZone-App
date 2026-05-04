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

// POST /api/admin/trainer-attendance  { trainerId, date, status, notes }
export async function POST(req: NextRequest) {
  const auth = await requireAdminFeature("trainers");
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const { trainerId, date, status, notes } = body as {
    trainerId: string;
    date: string;
    status: string;
    notes?: string;
  };

  if (!trainerId || !date || !status) {
    return NextResponse.json({ error: "trainerId و date و status مطلوبون" }, { status: 400 });
  }
  if (!["present", "absent", "late"].includes(status)) {
    return NextResponse.json({ error: "status غير صحيح" }, { status: 400 });
  }

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return NextResponse.json({ error: "تاريخ غير صحيح" }, { status: 400 });
  }

  const log = await (db as any).trainerAttendanceLog.upsert({
    where: { trainerId_date: { trainerId, date: dateObj } },
    create: { trainerId, date: dateObj, status, notes: notes ?? null, recordedById: auth.user.id },
    update: { status, notes: notes ?? null, recordedById: auth.user.id },
  });

  return NextResponse.json({ log });
}

// DELETE /api/admin/trainer-attendance?id=X
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminFeature("trainers");
  if ("error" in auth) return auth.error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  await (db as any).trainerAttendanceLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
