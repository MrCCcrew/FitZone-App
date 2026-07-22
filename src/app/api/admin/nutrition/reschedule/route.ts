import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function checkAdmin() {
  const guard = await requireAdminFeature("nutrition");
  return "error" in guard
    ? { error: guard.error, role: null, userId: null }
    : { error: null, role: guard.role, userId: guard.session.user.id };
}

// GET /api/admin/nutrition/reschedule — get reschedule requests
export async function GET(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  // Get my nutritionist profile to filter requests
  const myProfile = await db.nutritionistProfile.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!myProfile) {
    return NextResponse.json({ requests: [] });
  }

  const where: Record<string, unknown> = {
    session: { nutritionistId: myProfile.id },
  };

  if (status) {
    where.status = status;
  }

  const requests = await db.rescheduleRequest.findMany({
    where,
    include: {
      session: {
        select: {
          id: true,
          price: true,
          selectedSlot: true,
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

// POST /api/admin/nutrition/reschedule — doctor initiates reschedule request
export async function POST(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    sessionId: string;
    proposedNewSlot: string;
    doctorReason?: string;
  };

  if (!body.sessionId || !body.proposedNewSlot) {
    return NextResponse.json({ error: "sessionId و proposedNewSlot مطلوبان" }, { status: 400 });
  }

  // Check if session exists and is paid
  const session = await db.nutritionSession.findUnique({
    where: { id: body.sessionId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      nutritionist: { select: { id: true, name: true, userId: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
  }

  if (session.status !== "paid") {
    return NextResponse.json({ error: "لا يمكن إعادة جدولة جلسة غير مدفوعة" }, { status: 400 });
  }

  // Check if doctor owns this session
  if (session.nutritionist.userId !== userId) {
    return NextResponse.json({ error: "غير مصرح لك بهذا الإجراء" }, { status: 403 });
  }

  // Check if there's already a pending reschedule request
  const existingRequest = await db.rescheduleRequest.findFirst({
    where: {
      sessionId: body.sessionId,
      status: { in: ["pending_client", "client_rejected"] },
    },
  });

  if (existingRequest) {
    return NextResponse.json({ error: "يوجد طلب إعادة جدولة معلق بالفعل" }, { status: 400 });
  }

  // Create reschedule request
  const rescheduleRequest = await db.rescheduleRequest.create({
    data: {
      sessionId: body.sessionId,
      initiatedBy: "doctor_initiated",
      status: "pending_client",
      proposedNewSlot: body.proposedNewSlot,
      doctorReason: body.doctorReason ?? null,
    },
  });

  // TODO: Send push notification to client
  // await sendPushNotification(session.userId, {
  //   title: "طلب تغيير موعد",
  //   body: `الدكتورة ${session.nutritionist.name} تطلب تغيير موعد جلستك إلى ${body.proposedNewSlot}`,
  // });

  await logAudit({
    action: "create_reschedule_request",
    targetType: "RescheduleRequest",
    targetId: rescheduleRequest.id,
    details: JSON.stringify({
      sessionId: body.sessionId,
      proposedNewSlot: body.proposedNewSlot,
    }),
  });

  return NextResponse.json({ rescheduleRequest });
}

// PATCH /api/admin/nutrition/reschedule — doctor handles refund request
export async function PATCH(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    requestId: string;
    action: "approve_refund" | "reject_refund";
    reason?: string;
  };

  if (!body.requestId || !body.action) {
    return NextResponse.json({ error: "requestId و action مطلوبان" }, { status: 400 });
  }

  const request = await db.rescheduleRequest.findUnique({
    where: { id: body.requestId },
    include: {
      session: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          nutritionist: { select: { id: true, userId: true } },
        },
      },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }

  // Check if doctor owns this session
  if (request.session.nutritionist.userId !== userId) {
    return NextResponse.json({ error: "غير مصرح لك بهذا الإجراء" }, { status: 403 });
  }

  if (request.status !== "client_wants_refund") {
    return NextResponse.json({ error: "هذا الطلب ليس في حالة انتظار موافقة على الاسترجاع" }, { status: 400 });
  }

  let updateData: Record<string, unknown> = {
    refundApprovedBy: userId,
    refundApprovedAt: new Date(),
  };

  if (body.action === "approve_refund") {
    // Approve refund - add money back to customer's wallet
    await db.$transaction(async (tx: any) => {
      // Update reschedule request
      await tx.rescheduleRequest.update({
        where: { id: body.requestId },
        data: {
          ...updateData,
          refundStatus: "approved",
          status: "refund_approved",
        },
      });

      // Add amount to wallet
      const wallet = await tx.wallet.upsert({
        where: { userId: request.session.userId },
        create: {
          userId: request.session.userId,
          balance: request.refundAmount ?? request.session.price,
        },
        update: {
          balance: { increment: request.refundAmount ?? request.session.price },
        },
      });

      // Create wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: request.refundAmount ?? request.session.price,
          type: "refund",
          description: `استرجاع مبلغ جلسة تغذية - طلب إعادة جدولة`,
        },
      });

      // Update nutrition session status
      await tx.nutritionSession.update({
        where: { id: request.sessionId },
        data: { status: "cancelled" },
      });
    });

    // TODO: Send push notification
    // await sendPushNotification(request.session.userId, {
    //   title: "تمت الموافقة على الاسترجاع",
    //   body: `تم إضافة ${request.refundAmount ?? request.session.price} جنيه إلى محفظتك`,
    // });
  } else {
    // Reject refund
    await db.rescheduleRequest.update({
      where: { id: body.requestId },
      data: {
        ...updateData,
        refundStatus: "rejected",
        status: "refund_rejected",
      },
    });

    // TODO: Send push notification
    // await sendPushNotification(request.session.userId, {
    //   title: "تم رفض طلب الاسترجاع",
    //   body: body.reason ?? "يرجى التواصل مع الدكتورة لتحديد موعد آخر",
    // });
  }

  await logAudit({
    action: body.action,
    targetType: "RescheduleRequest",
    targetId: body.requestId,
    details: body.reason,
  });

  const updated = await db.rescheduleRequest.findUnique({
    where: { id: body.requestId },
    include: {
      session: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          nutritionist: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ request: updated });
}
