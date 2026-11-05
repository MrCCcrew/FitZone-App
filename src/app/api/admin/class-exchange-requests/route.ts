import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import {
  ExchangeDomainError,
  executeClassExchange,
} from "@/lib/class-exchange-service";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const guard =
    /* CLASS_EXCHANGE_REVIEW_PERMISSION_SYSTEMIC */
    await requireAdminPermission(
      "class_exchanges_review",
    );

  if ("error" in guard) {
    return guard.error;
  }

  const url = new URL(req.url);
  const archivedOnly =
    url.searchParams.get("archived") === "1";

  const requests =
    await db.classExchangeRequest.findMany({
      where: archivedOnly
        ? {
            archivedAt: {
              not: null,
            },
          }
        : {
            archivedAt: null,
          },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        userMembership: {
          include: {
            membership: {
              select: {
                name: true,
              },
            },
          },
        },
        targetSchedule: {
          include: {
            class: {
              include: {
                trainer: true,
              },
            },
          },
        },
      },
      orderBy: {
        requestedAt: "desc",
      },
    });

  return NextResponse.json(
    requests.map((request) => ({
      id: request.id,
      status: request.status,
      note: request.note,
      requestedAt:
        request.requestedAt.toISOString(),
      reviewedAt:
        request.reviewedAt?.toISOString() ??
        null,
      reviewedByUserId:
        request.reviewedByUserId,
      rejectionReason:
        request.rejectionReason,
      archivedAt:
        request.archivedAt?.toISOString() ??
        null,
      archivedByUserId:
        request.archivedByUserId,
      sourceBookingIds:
        request.sourceBookingIds
          ? JSON.parse(
              request.sourceBookingIds,
            )
          : [],

      user: request.user,

      membership: {
        id: request.userMembership.id,
        name:
          request.userMembership.membership.name,
        status:
          request.userMembership.status,
      },

      targetSchedule: {
        id: request.targetSchedule.id,
        date:
          request.targetSchedule.date.toISOString(),
        time:
          request.targetSchedule.time,
        availableSpots:
          request.targetSchedule.availableSpots,
        isActive:
          request.targetSchedule.isActive,
        class: {
          id:
            request.targetSchedule.class.id,
          name:
            request.targetSchedule.class.name,
          trainer:
            request.targetSchedule.class.trainer
              ?.name ?? "",
        },
      },
    })),
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function PATCH(req: Request) {
  const guard =
    await requireAdminPermission(
      "class_exchanges_review",
    );

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const payload =
      (await req.json()) as {
        requestId?: string;
        decision?:
          | "approve"
          | "reject";
        sourceBookingIds?: string[];
        rejectionReason?: string;
        action?:
          | "archive"
          | "restore";
      };

    const requestId =
      payload.requestId?.trim() ?? "";

    if (!requestId) {
      return NextResponse.json(
        {
          error:
            "طلب الاستبدال غير محدد.",
        },
        { status: 400 },
      );
    }

    if (
      payload.action === "archive" ||
      payload.action === "restore"
    ) {
      // Preserve the historical authorization contract:
      // archive/restore remains restricted to full admins.
      if (guard.role !== "admin") {
        return NextResponse.json(
          {
            error:
              "أرشفة طلبات الاستبدال متاحة للمسؤول فقط.",
          },
          { status: 403 },
        );
      }

      const existing =
        await db.classExchangeRequest.findUnique({
          where: {
            id: requestId,
          },
          select: {
            id: true,
            status: true,
            archivedAt: true,
          },
        });

      if (!existing) {
        return NextResponse.json(
          {
            error:
              "طلب الاستبدال غير موجود.",
          },
          { status: 404 },
        );
      }

      if (
        existing.status === "pending"
      ) {
        return NextResponse.json(
          {
            error:
              "لا يمكن أرشفة طلب ما زال قيد المراجعة.",
          },
          { status: 409 },
        );
      }

      const archive =
        payload.action === "archive";

      await db.classExchangeRequest.update({
        where: {
          id: existing.id,
        },
        data: archive
          ? {
              archivedAt:
                new Date(),
              archivedByUserId:
                guard.session.id,
            }
          : {
              archivedAt: null,
              archivedByUserId: null,
            },
      });

      return NextResponse.json({
        success: true,
        archived: archive,
      });
    }

    // Review permission is enforced once at the PATCH route boundary.
    // Class-exchange review remains independent from booking rescheduling.

    const request =
      await db.classExchangeRequest.findUnique({
        where: {
          id: requestId,
        },
        include: {
          targetSchedule: {
            include: {
              class: true,
            },
          },
        },
      });

    if (!request) {
      return NextResponse.json(
        {
          error:
            "طلب الاستبدال غير موجود.",
        },
        { status: 404 },
      );
    }

    if (request.status !== "pending") {
      return NextResponse.json(
        {
          error:
            "تمت مراجعة هذا الطلب بالفعل.",
        },
        { status: 409 },
      );
    }

    if (payload.decision === "reject") {
      const reason =
        payload.rejectionReason?.trim() ??
        "";

      if (reason.length > 1000) {
        return NextResponse.json(
          {
            error:
              "سبب الرفض طويل جدًا.",
          },
          { status: 400 },
        );
      }

      const rejected =
        await db.classExchangeRequest.updateMany({
          where: {
            id: request.id,
            status: "pending",
          },
          data: {
            status: "rejected",
            pendingKey: null,
            reviewedAt: new Date(),
            reviewedByUserId:
              guard.session.id,
            rejectionReason:
              reason || null,
          },
        });

      if (rejected.count !== 1) {
        return NextResponse.json(
          {
            error:
              "تمت مراجعة هذا الطلب بالفعل.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({
        success: true,
        decision: "rejected",
      });
    }

    if (payload.decision !== "approve") {
      return NextResponse.json(
        {
          error:
            "قرار مراجعة الطلب غير محدد.",
        },
        { status: 400 },
      );
    }

    const sourceBookingIds =
      Array.isArray(
        payload.sourceBookingIds,
      )
        ? Array.from(
            new Set(
              payload.sourceBookingIds
                .filter(
                  (
                    value,
                  ): value is string =>
                    typeof value === "string",
                )
                .map((value) =>
                  value.trim(),
                )
                .filter(Boolean),
            ),
          )
        : [];

    if (sourceBookingIds.length !== 2) {
      return NextResponse.json(
        {
          error:
            "يجب اختيار حصتين مستقبليتين بالضبط لإتمام الاستبدال.",
        },
        { status: 400 },
      );
    }

    const result =
      await executeClassExchange({
        userMembershipId:
          request.userMembershipId,
        scheduleId:
          request.targetScheduleId,
        sourceBookingIds,
        reason:
          request.note?.trim() ||
          `طلب استبدال من العميلة إلى ${request.targetSchedule.class.name}`,
        createdByUserId:
          guard.session.id,
        classExchangeRequestId:
          request.id,
      });

    return NextResponse.json({
      success: true,
      decision: "approved",
      requestId: request.id,
      ...result,
    });
  } catch (error) {
    if (
      error instanceof
      ExchangeDomainError
    ) {
      return NextResponse.json(
        {
          error:
            "تعذر تنفيذ الاستبدال بسبب تغير حالة الاشتراك أو الحصص أو الموعد.",
          code: error.code,
        },
        { status: 409 },
      );
    }

    const code =
      error instanceof Error
        ? error.message
        : "UNKNOWN";

    if (
      code ===
        "CLASS_EXCHANGE_REQUEST_NOT_FOUND" ||
      code ===
        "CLASS_EXCHANGE_REQUEST_ALREADY_REVIEWED" ||
      code ===
        "CLASS_EXCHANGE_REQUEST_MISMATCH"
    ) {
      return NextResponse.json(
        {
          error:
            "تعذر اعتماد الطلب لأنه تغير أو تمت مراجعته بالفعل.",
          code,
        },
        { status: 409 },
      );
    }

    console.error(
      "[ADMIN_CLASS_EXCHANGE_REQUEST]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر مراجعة طلب الاستبدال.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const guard =
    await requireAdminPermission(
      "bookings_reschedule",
    );

  if ("error" in guard) {
    return guard.error;
  }

  if (guard.role !== "admin") {
    return NextResponse.json(
      {
        error:
          "حذف طلبات الاستبدال متاح للمسؤول فقط.",
      },
      { status: 403 },
    );
  }

  try {
    const payload =
      (await req.json()) as {
        requestId?: string;
      };

    const requestId =
      payload.requestId?.trim() ?? "";

    if (!requestId) {
      return NextResponse.json(
        {
          error:
            "طلب الاستبدال غير محدد.",
        },
        { status: 400 },
      );
    }

    const existing =
      await db.classExchangeRequest.findUnique({
        where: {
          id: requestId,
        },
        select: {
          id: true,
          status: true,
          archivedAt: true,
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "طلب الاستبدال غير موجود.",
        },
        { status: 404 },
      );
    }

    if (!existing.archivedAt) {
      return NextResponse.json(
        {
          error:
            "لا يمكن حذف الطلب نهائيًا قبل أرشفته.",
        },
        { status: 409 },
      );
    }

    await db.classExchangeRequest.delete({
      where: {
        id: existing.id,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: true,
    });
  } catch (error) {
    console.error(
      "[ADMIN_CLASS_EXCHANGE_REQUEST_DELETE]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر حذف طلب الاستبدال المؤرشف.",
      },
      { status: 500 },
    );
  }
}

