import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import {
  applyMembershipBookingPlanTx,
  MembershipBookingPlanError,
} from "@/lib/payments/membership-booking-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const currentUser = await getCurrentAppUser();

  if (!currentUser?.id) {
    return NextResponse.json(
      { error: "غير مصرح." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    userMembershipId?: string;
    selectedScheduleIds?: unknown;
  } | null;

  const userMembershipId =
    typeof body?.userMembershipId === "string"
      ? body.userMembershipId.trim()
      : "";

  const selectedScheduleIds = Array.isArray(
    body?.selectedScheduleIds,
  )
    ? [
        ...new Set(
          body.selectedScheduleIds.filter(
            (value): value is string =>
              typeof value === "string" &&
              value.trim().length > 0,
          ),
        ),
      ]
    : [];

  if (!userMembershipId) {
    return NextResponse.json(
      { error: "الاشتراك مطلوب." },
      { status: 400 },
    );
  }

  if (selectedScheduleIds.length === 0) {
    return NextResponse.json(
      { error: "اختاري موعدًا واحدًا على الأقل." },
      { status: 400 },
    );
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        /*
         * Prove that this membership belongs to an activated
         * Friend Offer participant. Do not allow this route to
         * become a generic membership booking endpoint.
         */
        const participant =
          await tx.friendOfferParticipant.findFirst({
            where: {
              userId: currentUser.id,
              userMembershipId,
              status: "activated",
              group: {
                status: "completed",
              },
            },
            select: {
              id: true,
              userId: true,
              groupId: true,
              userMembershipId: true,
            },
          });

        if (!participant) {
          return {
            kind: "NOT_FRIEND_MEMBERSHIP" as const,
          };
        }

        const membership =
          await tx.userMembership.findUnique({
            where: {
              id: userMembershipId,
            },
            select: {
              id: true,
              userId: true,
              status: true,
              startDate: true,
              endDate: true,
              membershipId: true,
              offerId: true,
              totalSessions: true,
              snapshotDurationDays: true,
              bookingPatternSnapshot: true,
              membership: {
                select: {
                  kind: true,
                  duration: true,
                  sessionsCount: true,
                },
              },
            },
          });

        if (!membership) {
          return {
            kind: "MEMBERSHIP_NOT_FOUND" as const,
          };
        }

        if (membership.userId !== currentUser.id) {
          return {
            kind: "OWNERSHIP_MISMATCH" as const,
          };
        }

        if (membership.status !== "active") {
          return {
            kind: "MEMBERSHIP_NOT_ACTIVE" as const,
          };
        }

        if (!membership.offerId) {
          return {
            kind: "OFFER_MISSING" as const,
          };
        }

        /*
         * Contract already exists:
         * do NOT allow selecting a new pattern.
         * The immutable contract remains authoritative.
         */
        if (membership.bookingPatternSnapshot) {
          return {
            kind: "ALREADY_CONFIGURED" as const,
          };
        }

        const duration =
          membership.snapshotDurationDays ??
          membership.membership.duration;

        const sessionsCount =
          membership.totalSessions ??
          membership.membership.sessionsCount ??
          null;

        const bookingResult =
          await applyMembershipBookingPlanTx({
            tx,
            userId: currentUser.id,
            userMembershipId: membership.id,
            startDate: membership.startDate,
            endDate: membership.endDate,
            selectedScheduleIds,
            source: {
              type: "offer",
              id: membership.offerId,
            },
            plan: {
              kind: membership.membership.kind,
              sessionsCount,
              duration,
            },
          });

        return {
          kind: "APPLIED" as const,
          createdCount:
            bookingResult.createdCount,
          bookedSchedules:
            bookingResult.bookedSchedules.map(
              (row: {
                date: Date;
                time: string;
                className: string;
                trainerName: string;
              }) => ({
                date: row.date.toISOString(),
                time: row.time,
                className: row.className,
                trainerName: row.trainerName,
              }),
            ),
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    switch (result.kind) {
      case "APPLIED":
        return NextResponse.json({
          success: true,
          createdCount: result.createdCount,
          bookedSchedules:
            result.bookedSchedules,
        });

      case "ALREADY_CONFIGURED":
        return NextResponse.json(
          {
            error:
              "تم تحديد جدول هذا الاشتراك بالفعل ولا يمكن إنشاء نمط جديد.",
          },
          { status: 409 },
        );

      case "NOT_FRIEND_MEMBERSHIP":
        return NextResponse.json(
          {
            error:
              "هذا الاشتراك ليس اشتراك عرض صحاب مفعّلًا لهذا الحساب.",
          },
          { status: 403 },
        );

      case "MEMBERSHIP_NOT_FOUND":
        return NextResponse.json(
          { error: "الاشتراك غير موجود." },
          { status: 404 },
        );

      case "OWNERSHIP_MISMATCH":
        return NextResponse.json(
          { error: "غير مصرح بهذا الاشتراك." },
          { status: 403 },
        );

      case "MEMBERSHIP_NOT_ACTIVE":
        return NextResponse.json(
          { error: "الاشتراك غير نشط." },
          { status: 409 },
        );

      case "OFFER_MISSING":
        return NextResponse.json(
          {
            error:
              "بيانات عرض الصحاب غير مكتملة.",
          },
          { status: 409 },
        );
    }
  } catch (error) {
    if (error instanceof MembershipBookingPlanError) {
      return NextResponse.json(
        {
          error: error.message,
          action: error.action ?? null,
        },
        { status: 409 },
      );
    }

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        {
          error:
            "حدث تعارض أثناء تثبيت الجدول، يرجى المحاولة مرة أخرى.",
        },
        { status: 409 },
      );
    }

    console.error(
      "[FRIEND_POST_ACTIVATION_SCHEDULE]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر تثبيت جدول الاشتراك حاليًا.",
      },
      { status: 500 },
    );
  }
}
