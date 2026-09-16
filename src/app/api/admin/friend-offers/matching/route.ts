import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function shareMinorForIndex(
  totalMinor: number,
  requiredMembers: number,
  index: number,
) {
  const base = Math.floor(totalMinor / requiredMembers);
  const remainder = totalMinor % requiredMembers;
  return base + (index < remainder ? 1 : 0);
}

export async function GET(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");

    if (mode === "candidates") {
      const search = (url.searchParams.get("search") ?? "").trim();

      if (search.length < 2) {
        return NextResponse.json({ users: [] });
      }

      const users = await db.user.findMany({
        where: {
          role: "member",
          isActive: true,
          emailVerified: { not: null },
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
        orderBy: { name: "asc" },
        take: 20,
      });

      return NextResponse.json({ users });
    }

    const groups = await db.friendOfferGroup.findMany({
      where: {
        matchingEnabled: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        config: {
          select: {
            requiredMembers: true,
            inviteExpiryHours: true,
            offer: {
              select: {
                id: true,
                title: true,
                titleEn: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        participants: {
          orderBy: {
            joinedAt: "asc",
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            shareAmountMinor: true,
            paidAt: true,
            joinedAt: true,
            paymentTransactionId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
            paymentTransaction: {
              select: {
                id: true,
                status: true,
                amount: true,
                provider: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const now = new Date();

    const rows = groups.map((group) => {
      const activeParticipants = group.participants.filter(
        (participant) => participant.status !== "cancelled",
      );

      const joinedCount = activeParticipants.length;
      const remainingPlaces = Math.max(
        0,
        group.config.requiredMembers - joinedCount,
      );

      const paidCount = activeParticipants.filter(
        (participant) =>
          participant.status === "paid" ||
          participant.status === "activated" ||
          participant.paymentTransaction?.status === "paid",
      ).length;

      const hasEconomicCommitment = activeParticipants.some(
        (participant) =>
          participant.status === "paid" ||
          participant.status === "activated" ||
          participant.paymentTransaction?.status === "paid",
      );

      return {
        id: group.id,
        token: group.inviteToken,
        status: group.status,
        matchingEnabled: group.matchingEnabled,
        createdAt: group.createdAt.toISOString(),
        expiresAt: group.expiresAt.toISOString(),
        isTimeExpired: group.expiresAt.getTime() <= now.getTime(),
        hasEconomicCommitment,
        priceSnapshotMinor: group.priceSnapshotMinor,

        offer: {
          id: group.config.offer.id,
          title: group.config.offer.title,
          titleEn: group.config.offer.titleEn,
        },

        creator: {
          id: group.creator.id,
          name: group.creator.name,
          email: group.creator.email,
          phone: group.creator.phone,
        },

        requiredMembers: group.config.requiredMembers,
        joinedCount,
        remainingPlaces,
        paidCount,

        participants: group.participants.map((participant) => ({
          id: participant.id,
          userId: participant.userId,
          role: participant.role,
          status: participant.status,
          shareAmountMinor: participant.shareAmountMinor,
          paidAt: participant.paidAt?.toISOString() ?? null,
          joinedAt: participant.joinedAt.toISOString(),
          paymentTransactionId: participant.paymentTransactionId,
          user: {
            id: participant.user.id,
            name: participant.user.name,
            email: participant.user.email,
            phone: participant.user.phone,
          },
          payment: participant.paymentTransaction
            ? {
                id: participant.paymentTransaction.id,
                status: participant.paymentTransaction.status,
                amount: participant.paymentTransaction.amount,
                provider: participant.paymentTransaction.provider,
                createdAt:
                  participant.paymentTransaction.createdAt.toISOString(),
              }
            : null,
        })),
      };
    });

    return NextResponse.json({ groups: rows });
  } catch (error) {
    console.error("[ADMIN_FRIEND_MATCHING_GET]", error);

    return NextResponse.json(
      { error: "تعذر تحميل طلبات عرض الصحاب." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json().catch(() => null)) as {
    groupId?: string;
    participantId?: string;
  } | null;

  const groupId =
    typeof body?.groupId === "string" ? body.groupId.trim() : "";

  const participantId =
    typeof body?.participantId === "string"
      ? body.participantId.trim()
      : "";

  if (!groupId || !participantId) {
    return NextResponse.json(
      { error: "المجموعة والمشاركة مطلوبتان." },
      { status: 400 },
    );
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const group = await tx.friendOfferGroup.findUnique({
          where: { id: groupId },
          include: {
            config: {
              select: {
                requiredMembers: true,
              },
            },
            participants: {
              select: {
                id: true,
                userId: true,
                role: true,
                status: true,
                paymentTransactionId: true,
                userMembershipId: true,
                paymentTransaction: {
                  select: {
                    status: true,
                  },
                },
              },
            },
          },
        });

        if (!group || !group.matchingEnabled) {
          return { kind: "NOT_FOUND" as const };
        }

        if (
          group.status === "completed" ||
          group.status === "finalizing" ||
          group.status === "cancelled"
        ) {
          return { kind: "GROUP_LOCKED" as const };
        }

        const participant = group.participants.find(
          (row) => row.id === participantId,
        );

        if (!participant) {
          return { kind: "PARTICIPANT_NOT_FOUND" as const };
        }

        if (participant.role === "creator") {
          return { kind: "CREATOR_BLOCKED" as const };
        }

        if (participant.status === "cancelled") {
          return { kind: "ALREADY_CANCELLED" as const };
        }

        const hasEconomicCommitment =
          participant.status === "checkout_started" ||
          participant.status === "paid" ||
          participant.status === "activated" ||
          participant.paymentTransactionId !== null ||
          participant.userMembershipId !== null ||
          participant.paymentTransaction?.status === "paid" ||
          participant.paymentTransaction?.status === "pending" ||
          participant.paymentTransaction?.status === "requires_action";

        if (hasEconomicCommitment) {
          return { kind: "ECONOMIC_COMMITMENT" as const };
        }

        const cancelled = await tx.friendOfferParticipant.updateMany({
          where: {
            id: participant.id,
            groupId: group.id,
            role: "invited",
            status: {
              in: ["joined"],
            },
            paymentTransactionId: null,
            userMembershipId: null,
          },
          data: {
            status: "cancelled",
          },
        });

        if (cancelled.count !== 1) {
          return { kind: "STATE_CHANGED" as const };
        }

        const remainingActive =
          group.participants.filter(
            (row) =>
              row.id !== participant.id &&
              row.status !== "cancelled",
          ).length;

        const nextStatus =
          remainingActive >= group.config.requiredMembers
            ? "ready"
            : "waiting";

        if (group.status !== nextStatus) {
          await tx.friendOfferGroup.update({
            where: { id: group.id },
            data: { status: nextStatus },
          });
        }

        return {
          kind: "REMOVED" as const,
          nextStatus,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    switch (result.kind) {
      case "REMOVED":
        return NextResponse.json({
          success: true,
          nextStatus: result.nextStatus,
        });

      case "NOT_FOUND":
        return NextResponse.json(
          { error: "طلب عرض الصحاب غير موجود." },
          { status: 404 },
        );

      case "PARTICIPANT_NOT_FOUND":
        return NextResponse.json(
          { error: "المشاركة غير موجودة." },
          { status: 404 },
        );

      case "CREATOR_BLOCKED":
        return NextResponse.json(
          {
            error:
              "لا يمكن إزالة صاحبة الطلب من هنا.",
          },
          { status: 409 },
        );

      case "GROUP_LOCKED":
        return NextResponse.json(
          {
            error:
              "لا يمكن تعديل هذه المجموعة في حالتها الحالية.",
          },
          { status: 409 },
        );

      case "ECONOMIC_COMMITMENT":
        return NextResponse.json(
          {
            error:
              "لا يمكن إزالة العميلة بعد بدء أو إتمام عملية الدفع.",
          },
          { status: 409 },
        );

      case "ALREADY_CANCELLED":
        return NextResponse.json(
          {
            error:
              "هذه المشاركة ملغاة بالفعل.",
          },
          { status: 409 },
        );

      case "STATE_CHANGED":
        return NextResponse.json(
          {
            error:
              "تغيرت حالة المشاركة، يرجى تحديث الصفحة والمحاولة مرة أخرى.",
          },
          { status: 409 },
        );
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        {
          error:
            "حدث تعارض أثناء إزالة المشاركة، يرجى إعادة المحاولة.",
        },
        { status: 409 },
      );
    }

    console.error("[ADMIN_FRIEND_MATCHING_DELETE]", error);

    return NextResponse.json(
      { error: "تعذر إزالة المشاركة حاليًا." },
      { status: 500 },
    );
  }
}


export async function POST(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json().catch(() => null)) as {
    groupId?: string;
    userId?: string;
  } | null;

  const groupId =
    typeof body?.groupId === "string" ? body.groupId.trim() : "";

  const userId =
    typeof body?.userId === "string" ? body.userId.trim() : "";

  if (!groupId || !userId) {
    return NextResponse.json(
      { error: "المجموعة والعميلة مطلوبتان." },
      { status: 400 },
    );
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const group = await tx.friendOfferGroup.findUnique({
          where: { id: groupId },
          include: {
            config: {
              include: {
                offer: {
                  select: {
                    id: true,
                    isActive: true,
                    expiresAt: true,
                  },
                },
              },
            },
            participants: {
              select: {
                id: true,
                userId: true,
                status: true,
                paymentTransactionId: true,
                userMembershipId: true,
                paymentTransaction: {
                  select: {
                    status: true,
                  },
                },
              },
            },
          },
        });

        if (!group || !group.matchingEnabled) {
          return { kind: "NOT_FOUND" as const };
        }

        if (
          group.status === "cancelled" ||
          group.status === "completed" ||
          group.status === "finalizing"
        ) {
          return { kind: "GROUP_UNAVAILABLE" as const };
        }

        const targetActiveParticipants = group.participants.filter(
          (participant) => participant.status !== "cancelled",
        );

        const targetHasEconomicCommitment =
          targetActiveParticipants.some(
            (participant) =>
              participant.status === "paid" ||
              participant.status === "activated" ||
              participant.paymentTransaction?.status === "paid",
          );

        const now = new Date();

        const mutableTermsUnavailable =
          group.expiresAt.getTime() <= now.getTime() ||
          !group.config.isActive ||
          !group.config.offer.isActive ||
          group.config.offer.expiresAt.getTime() <= now.getTime();

        if (!targetHasEconomicCommitment && mutableTermsUnavailable) {
          return { kind: "GROUP_UNAVAILABLE" as const };
        }

        const existingTargetParticipant = group.participants.find(
          (participant) => participant.userId === userId,
        );

        if (
          existingTargetParticipant &&
          existingTargetParticipant.status !== "cancelled"
        ) {
          return { kind: "ALREADY_JOINED" as const };
        }

        if (
          targetActiveParticipants.length >= group.config.requiredMembers
        ) {
          return { kind: "FULL" as const };
        }

        const candidate = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            role: true,
            isActive: true,
            emailVerified: true,
          },
        });

        if (
          !candidate ||
          candidate.role !== "member" ||
          !candidate.isActive ||
          !candidate.emailVerified
        ) {
          return { kind: "INVALID_CANDIDATE" as const };
        }

        const otherParticipations =
          await tx.friendOfferParticipant.findMany({
            where: {
              userId,
              groupId: { not: group.id },
              status: { not: "cancelled" },
            },
            include: {
              paymentTransaction: {
                select: {
                  id: true,
                  status: true,
                },
              },
              group: {
                include: {
                  participants: {
                    select: {
                      id: true,
                      userId: true,
                      status: true,
                      paymentTransactionId: true,
                    },
                  },
                },
              },
            },
          });

        const cancellableOldParticipantIds: string[] = [];
        const cancellableOldGroupIds: string[] = [];

        for (const participation of otherParticipations) {
          const hasPaymentCommitment =
            participation.status === "checkout_started" ||
            participation.status === "paid" ||
            participation.status === "activated" ||
            participation.paymentTransactionId !== null;

          if (hasPaymentCommitment) {
            return { kind: "OTHER_ECONOMIC_COMMITMENT" as const };
          }

          const activeOldParticipants =
            participation.group.participants.filter(
              (participant) => participant.status !== "cancelled",
            );

          const safeOwnMatchingRequest =
            participation.group.creatorUserId === userId &&
            participation.group.matchingEnabled === true &&
            participation.group.status === "waiting" &&
            participation.status === "joined" &&
            participation.paymentTransactionId === null &&
            activeOldParticipants.length === 1 &&
            activeOldParticipants[0]?.userId === userId &&
            activeOldParticipants[0]?.paymentTransactionId === null;

          if (!safeOwnMatchingRequest) {
            return { kind: "OTHER_ACTIVE_GROUP" as const };
          }

          cancellableOldParticipantIds.push(participation.id);
          cancellableOldGroupIds.push(participation.group.id);
        }

        if (cancellableOldParticipantIds.length > 0) {
          await tx.friendOfferParticipant.updateMany({
            where: {
              id: { in: cancellableOldParticipantIds },
              status: "joined",
              paymentTransactionId: null,
            },
            data: {
              status: "cancelled",
            },
          });
        }

        if (cancellableOldGroupIds.length > 0) {
          await tx.friendOfferGroup.updateMany({
            where: {
              id: { in: cancellableOldGroupIds },
              status: "waiting",
            },
            data: {
              status: "cancelled",
            },
          });
        }

        const shareAmountMinor = shareMinorForIndex(
          group.priceSnapshotMinor,
          group.config.requiredMembers,
          targetActiveParticipants.length,
        );

        if (existingTargetParticipant) {
          if (
            existingTargetParticipant.paymentTransactionId ||
            existingTargetParticipant.userMembershipId
          ) {
            return { kind: "CANCELLED_TARGET_COMMITTED" as const };
          }

          await tx.friendOfferParticipant.update({
            where: { id: existingTargetParticipant.id },
            data: {
              role: "invited",
              status: "joined",
              joinedAt: now,
              shareAmountMinor,
            },
          });
        } else {
          await tx.friendOfferParticipant.create({
            data: {
              groupId: group.id,
              userId,
              role: "invited",
              status: "joined",
              shareAmountMinor,
            },
          });
        }

        const nextCount = targetActiveParticipants.length + 1;

        const nextStatus =
          nextCount >= group.config.requiredMembers
            ? "ready"
            : "waiting";

        if (group.status !== nextStatus) {
          await tx.friendOfferGroup.update({
            where: { id: group.id },
            data: { status: nextStatus },
          });
        }

        return {
          kind: "MATCHED" as const,
          cancelledOldGroups: cancellableOldGroupIds.length,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    switch (result.kind) {
      case "MATCHED":
        return NextResponse.json({
          success: true,
          cancelledOldGroups: result.cancelledOldGroups,
        });

      case "NOT_FOUND":
        return NextResponse.json(
          { error: "طلب عرض الصحاب غير موجود." },
          { status: 404 },
        );

      case "GROUP_UNAVAILABLE":
        return NextResponse.json(
          { error: "هذه المجموعة غير متاحة للمطابقة حاليًا." },
          { status: 409 },
        );

      case "ALREADY_JOINED":
        return NextResponse.json(
          { error: "العميلة موجودة بالفعل داخل هذه المجموعة." },
          { status: 409 },
        );

      case "FULL":
        return NextResponse.json(
          { error: "اكتمل عدد المشاركات في هذه المجموعة." },
          { status: 409 },
        );

      case "INVALID_CANDIDATE":
        return NextResponse.json(
          {
            error:
              "العميلة غير صالحة للمطابقة أو حسابها غير مفعل.",
          },
          { status: 409 },
        );

      case "OTHER_ECONOMIC_COMMITMENT":
        return NextResponse.json(
          {
            error:
              "لا يمكن مطابقة هذه العميلة لأنها مرتبطة بعملية دفع في مجموعة عرض صحاب أخرى.",
          },
          { status: 409 },
        );

      case "OTHER_ACTIVE_GROUP":
        return NextResponse.json(
          {
            error:
              "العميلة مرتبطة بمجموعة عرض صحاب أخرى لا يمكن إلغاؤها تلقائيًا بأمان.",
          },
          { status: 409 },
        );

      case "CANCELLED_TARGET_COMMITTED":
        return NextResponse.json(
          {
            error:
              "لا يمكن إعادة ضم هذه المشاركة لأن لها ارتباطًا ماليًا سابقًا.",
          },
          { status: 409 },
        );
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        {
          error:
            "حدث تعارض أثناء المطابقة، يرجى إعادة المحاولة.",
        },
        { status: 409 },
      );
    }

    console.error("[ADMIN_FRIEND_MATCHING_POST]", error);

    return NextResponse.json(
      { error: "تعذر تنفيذ المطابقة حاليًا." },
      { status: 500 },
    );
  }
}
