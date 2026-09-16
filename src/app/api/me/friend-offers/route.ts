import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { resolveBookingPolicy } from "@/lib/booking/booking-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function frozenTitle(
  snapshot: string | null,
  fallback: string,
): string {
  if (!snapshot) return fallback;

  try {
    const parsed = JSON.parse(snapshot) as Record<string, unknown>;

    if (
      typeof parsed.title === "string" &&
      parsed.title.trim()
    ) {
      return parsed.title;
    }
  } catch {
    // Keep live title only as a display fallback.
  }

  return fallback;
}

export async function GET() {
  const currentUser = await getCurrentAppUser();

  if (!currentUser?.id) {
    return NextResponse.json(
      { offers: [] },
      {
        status: 401,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      },
    );
  }

  try {
    const participations =
      await db.friendOfferParticipant.findMany({
        where: {
          userId: currentUser.id,
          status: {
            in: ["joined", "checkout_started", "paid", "activated"],
          },
          group: {
            status: {
                notIn: ["cancelled", "expired"],
              },
          },
        },
        orderBy: {
          joinedAt: "desc",
        },
        include: {
          paymentTransaction: {
            select: {
              id: true,
              status: true,
              checkoutUrl: true,
              amount: true,
            },
          },
          userMembership: {
            select: {
              id: true,
              status: true,
              bookingPatternSnapshot: true,
              totalSessions: true,
              snapshotDurationDays: true,
              membership: {
                select: {
                  kind: true,
                  sessionsCount: true,
                  duration: true,
                },
              },
            },
          },
          group: {
            include: {
              config: {
                include: {
                  offer: {
                    select: {
                      id: true,
                      title: true,
                      titleEn: true,
                    },
                  },
                },
              },
              participants: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          },
        },
      });

    const visibleParticipations = participations.filter(
      (participant) => {
        if (participant.status === "activated") {
          return (
            participant.group.status === "completed" &&
            participant.userMembership?.status === "active" &&
            !participant.userMembership.bookingPatternSnapshot
          );
        }

        if (
            participant.group.expiresAt.getTime() <= Date.now()
          ) {
            return false;
          }

          return participant.group.status !== "completed";
      },
    );

    const offers = visibleParticipations.map((participant) => {
      const activeParticipants =
        participant.group.participants.filter(
          (row) => row.status !== "cancelled",
        );

      const joinedCount = activeParticipants.length;

      return {
        participantId: participant.id,
        role: participant.role,
        participantStatus: participant.status,
        shareAmountMinor: participant.shareAmountMinor,
        paidAt: participant.paidAt?.toISOString() ?? null,

        membership: participant.userMembership
          ? (() => {
              const sessionsCount =
                participant.userMembership.totalSessions ??
                participant.userMembership.membership.sessionsCount ??
                null;

              const durationDays =
                participant.userMembership.snapshotDurationDays ??
                participant.userMembership.membership.duration;

              const bookingPolicy = resolveBookingPolicy({
                kind: participant.userMembership.membership.kind,
                sessionsCount,
                durationDays,
              });

              return {
                id: participant.userMembership.id,
                status: participant.userMembership.status,
                bookingConfigured:
                  Boolean(
                    participant.userMembership.bookingPatternSnapshot,
                  ),
                sessionsCount,
                durationDays,
                bookingPolicy,
              };
            })()
          : null,

        payment: participant.paymentTransaction
          ? {
              id: participant.paymentTransaction.id,
              status: participant.paymentTransaction.status,
              checkoutUrl:
                participant.paymentTransaction.checkoutUrl,
              amount: participant.paymentTransaction.amount,
            }
          : null,

        group: {
          id: participant.group.id,
          token: participant.group.inviteToken,
          status: participant.group.status,
          matchingEnabled: participant.group.matchingEnabled,
          requiredMembers:
            participant.group.config.requiredMembers,
          joinedCount,
          remainingPlaces: Math.max(
            0,
            participant.group.config.requiredMembers -
              joinedCount,
          ),
          expiresAt:
            participant.group.expiresAt.toISOString(),
        },

        offer: {
          id: participant.group.config.offer.id,
          title: frozenTitle(
            participant.group.offerTermsSnapshot,
            participant.group.config.offer.title,
          ),
          titleEn:
            participant.group.config.offer.titleEn,
        },
      };
    });

    return NextResponse.json(
      { offers },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("[ME_FRIEND_OFFERS_GET]", error);

    return NextResponse.json(
      { error: "تعذر تحميل عروض الصحاب.", offers: [] },
      { status: 500 },
    );
  }
}


export async function DELETE(req: Request) {
  const currentUser = await getCurrentAppUser();

  if (!currentUser?.id) {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول أولًا." },
      { status: 401 },
    );
  }

  try {
    const body = (await req.json()) as {
      participantId?: string;
    };

    const participantId = body.participantId?.trim();

    if (!participantId) {
      return NextResponse.json(
        { error: "دعوة عرض الصحاب غير محددة." },
        { status: 400 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      const participant =
        await tx.friendOfferParticipant.findFirst({
          where: {
            id: participantId,
            userId: currentUser.id,
          },
          include: {
            group: {
              include: {
                participants: {
                  select: {
                    status: true,
                    paymentTransaction: {
                      select: { status: true },
                    },
                  },
                },
              },
            },
          },
        });

      if (!participant) {
        return "NOT_FOUND" as const;
      }

      if (
        participant.role !== "creator" ||
        participant.group.creatorUserId !== currentUser.id
      ) {
        return "NOT_CREATOR" as const;
      }

      if (
        participant.group.status === "expired" ||
        participant.group.expiresAt.getTime() <= Date.now()
      ) {
        return "EXPIRED" as const;
      }

      if (
        !["waiting", "ready"].includes(
          participant.group.status,
        )
      ) {
        return "LOCKED" as const;
      }

      const paymentStarted =
        participant.group.participants.some((row) =>
          ["checkout_started", "paid", "activated"].includes(row.status) ||
          ["pending", "requires_action", "paid"].includes(
            row.paymentTransaction?.status ?? "",
          )
        );

      if (paymentStarted) {
        return "PAYMENT_STARTED" as const;
      }

      const claim =
        await tx.friendOfferGroup.updateMany({
          where: {
            id: participant.group.id,
            creatorUserId: currentUser.id,
            status: { in: ["waiting", "ready"] },
          },
          data: {
            status: "cancelled",
            matchingEnabled: false,
          },
        });

      if (claim.count !== 1) {
        return "CONFLICT" as const;
      }

      await tx.friendOfferParticipant.updateMany({
        where: {
          groupId: participant.group.id,
          status: "joined",
        },
        data: {
          status: "cancelled",
        },
      });

      return "CANCELLED" as const;
    });

    if (result === "CANCELLED") {
      return NextResponse.json({
        success: true,
        cancelled: true,
      });
    }

    const messages = {
      NOT_FOUND: ["دعوة عرض الصحاب غير موجودة.", 404],
      NOT_CREATOR: ["يمكن لصاحبة الدعوة فقط إلغاء الدعوة.", 403],
      EXPIRED: ["انتهت صلاحية الدعوة بالفعل.", 409],
      PAYMENT_STARTED: ["لا يمكن إلغاء الدعوة بعد بدء الدفع.", 409],
      LOCKED: ["لا يمكن إلغاء الدعوة بعد بدء التفعيل أو اكتمال العرض.", 409],
      CONFLICT: ["تغيرت حالة الدعوة، حدّثي الصفحة وحاولي مرة أخرى.", 409],
    } as const;

    const [message, status] = messages[result];

    return NextResponse.json(
      { error: message },
      { status },
    );
  } catch (error) {
    console.error("[ME_FRIEND_OFFERS_DELETE]", error);

    return NextResponse.json(
      { error: "تعذر إلغاء دعوة عرض الصحاب حاليًا." },
      { status: 500 },
    );
  }
}
