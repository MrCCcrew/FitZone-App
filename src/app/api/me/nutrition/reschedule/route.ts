import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function getUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), userId: null };
  }
  return { error: null, userId: session.user.id };
}

// GET /api/me/nutrition/reschedule — get my pending reschedule requests
export async function GET(req: Request) {
  const { error, userId } = await getUser();
  if (error) return error;

  const requests = await db.rescheduleRequest.findMany({
    where: {
      session: { userId },
      status: { in: ["pending_client", "client_rejected"] },
    },
    include: {
      session: {
        include: {
          nutritionist: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

// PATCH /api/me/nutrition/reschedule — client responds to reschedule request
export async function PATCH(req: Request) {
  const { error, userId } = await getUser();
  if (error) return error;

  const body = await req.json() as {
    requestId: string;
    action: "accept" | "reject" | "refund";
    clientChosenSlot?: string;
    clientReason?: string;
  };

  if (!body.requestId || !body.action) {
    return NextResponse.json({ error: "requestId و action مطلوبان" }, { status: 400 });
  }

  const request = await db.rescheduleRequest.findUnique({
    where: { id: body.requestId },
    include: {
      session: {
        include: {
          user: { select: { id: true, name: true } },
          nutritionist: { select: { id: true, name: true, userId: true, slotsJson: true } },
        },
      },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }

  // Check if user owns this session
  if (request.session.userId !== userId) {
    return NextResponse.json({ error: "غير مصرح لك بهذا الإجراء" }, { status: 403 });
  }

  if (request.status !== "pending_client") {
    return NextResponse.json({ error: "هذا الطلب تمت الإجابة عليه بالفعل" }, { status: 400 });
  }

  let updateData: Record<string, unknown> = {
    clientResponse: body.action,
    clientReason: body.clientReason ?? null,
  };

  if (body.action === "accept") {
    // Client accepts the proposed new slot
    await db.$transaction(async (tx: any) => {
      await tx.rescheduleRequest.update({
        where: { id: body.requestId },
        data: {
          ...updateData,
          status: "client_accepted",
        },
      });

      // Update the nutrition session with new slot
      await tx.nutritionSession.update({
        where: { id: request.sessionId },
        data: {
          selectedSlot: request.proposedNewSlot,
        },
      });
    });

    // TODO: Send push notification to doctor
    // await sendPushNotification(request.session.nutritionist.userId, {
    //   title: "تم قبول تغيير الموعد",
    //   body: `${request.session.user.name} وافقت على الموعد الجديد: ${request.proposedNewSlot}`,
    // });
  } else if (body.action === "reject") {
    // Client rejects and chooses another slot
    if (!body.clientChosenSlot) {
      return NextResponse.json({ error: "يجب اختيار موعد بديل" }, { status: 400 });
    }

    await db.$transaction(async (tx: any) => {
      await tx.rescheduleRequest.update({
        where: { id: body.requestId },
        data: {
          ...updateData,
          clientChosenSlot: body.clientChosenSlot,
          status: "client_rejected",
        },
      });

      // Update the nutrition session with client's chosen slot
      await tx.nutritionSession.update({
        where: { id: request.sessionId },
        data: {
          selectedSlot: body.clientChosenSlot,
        },
      });
    });

    // TODO: Send push notification to doctor
    // await sendPushNotification(request.session.nutritionist.userId, {
    //   title: "اختيار موعد بديل",
    //   body: `${request.session.user.name} اختارت موعد بديل: ${body.clientChosenSlot}`,
    // });
  } else if (body.action === "refund") {
    // Client wants refund
    await db.rescheduleRequest.update({
      where: { id: body.requestId },
      data: {
        ...updateData,
        status: "client_wants_refund",
        refundAmount: request.session.price,
        refundStatus: "pending",
      },
    });

    // TODO: Send push notification to doctor
    // await sendPushNotification(request.session.nutritionist.userId, {
    //   title: "طلب استرجاع مبلغ",
    //   body: `${request.session.user.name} طلبت استرجاع مبلغ الجلسة (${request.session.price} جنيه)`,
    // });
  }

  const updated = await db.rescheduleRequest.findUnique({
    where: { id: body.requestId },
    include: {
      session: {
        include: {
          nutritionist: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  return NextResponse.json({ request: updated });
}
