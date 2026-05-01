import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import {
  buildAttendancePayload,
  ensureMembershipAttendancePass,
  ensurePrivateAttendancePass,
  getPrivateSessionsRemaining,
  isMembershipEligibleForAttendance,
  isPrivateApplicationEligibleForAttendance,
} from "@/lib/attendance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
  }

  const [activeMembership, privateApplications] = await Promise.all([
    db.userMembership.findFirst({
      where: { userId: user.id, status: "active" },
      include: {
        membership: true,
        bookings: {
          where: { status: { in: ["confirmed", "attended"] } },
          select: { id: true },
        },
      },
      orderBy: { startDate: "desc" },
    }),
    db.privateSessionApplication.findMany({
      where: { userId: user.id, OR: [{ status: "paid" }, { paidAt: { not: null } }] },
      include: {
        trainer: { select: { name: true } },
        attendanceCheckIns: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const passes: Array<{
    id: string;
    kind: "membership" | "private_session";
    label: string;
    code: string;
    payload: string;
    qrDataUrl: string;
    remainingSessions?: number | null;
    privateType?: string | null;
  }> = [];

  if (activeMembership && isMembershipEligibleForAttendance(activeMembership)) {
    const pass = await ensureMembershipAttendancePass(activeMembership.id);
    if (pass) {
      const payload = buildAttendancePayload(pass.code);
      const qrDataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 360,
      });

      passes.push({
        id: pass.id,
        kind: "membership",
        label: pass.label ?? activeMembership.membership.name,
        code: pass.code,
        payload,
        qrDataUrl,
        remainingSessions:
          activeMembership.totalSessions == null || activeMembership.totalSessions < 0
            ? null
            : Math.max(0, activeMembership.totalSessions - activeMembership.bookings.length),
      });
    }
  }

  for (const application of privateApplications) {
    if (!isPrivateApplicationEligibleForAttendance(application)) continue;
    const remainingSessions = getPrivateSessionsRemaining(application.attendanceCheckIns.length, application.sessionsCount);
    if (remainingSessions <= 0) continue;

    const pass = await ensurePrivateAttendancePass(application.id);
    if (!pass) continue;

    const payload = buildAttendancePayload(pass.code);
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 360,
    });

    passes.push({
      id: pass.id,
      kind: "private_session",
      label:
        pass.label ??
        `${application.type === "mini_private" ? "Mini Private" : "Private"} - ${application.trainer.name}`,
      code: pass.code,
      payload,
      qrDataUrl,
      remainingSessions,
      privateType: application.type,
    });
  }

  return NextResponse.json({ passes });
}
