import { resolveBookingPolicy } from "@/lib/booking/booking-policy";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  evaluateFriendOfferStudentEligibility,
} from "@/lib/friend-offer-student-eligibility";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { getEligibilityPolicySnapshotForSource } from "@/lib/get-eligible-classes";

const TOKEN_BYTES = 18;
const MAX_TOKEN_ATTEMPTS = 5;

function generateInviteToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function toMinorUnits(amount: number) {
  const raw = Number(amount);

  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error("INVALID_FRIEND_OFFER_PRICE");
  }

  const minor = Math.round(raw * 100);

  if (Math.abs(raw * 100 - minor) > 0.000001) {
    throw new Error("INVALID_FRIEND_OFFER_PRICE_PRECISION");
  }

  return minor;
}

function shareMinorForIndex(
  totalMinor: number,
  requiredMembers: number,
  index: number,
) {
  const base = Math.floor(totalMinor / requiredMembers);
  const remainder = totalMinor % requiredMembers;

  return base + (index < remainder ? 1 : 0);
}

function publicGroupShape(
  group: {
    id: string;
    inviteToken: string;
    status: string;
    expiresAt: Date;
    priceSnapshotMinor: number;
    offerTermsSnapshot: string | null;
    matchingEnabled: boolean;
    individualInvitesEnabled: boolean;
    config: {
      requiredMembers: number;
      offer: {
        id: string;
        title: string;
        titleEn: string | null;
        specialPrice: number | null;
        sessionsCount: number | null;
        durationDays: number | null;
        expiresAt: Date;
        isActive: boolean;
        requiresEgyptianNationalId: boolean;
      };
    };
    participants: Array<{
      userId: string;
      role: string;
      status: string;
      userMembershipId: string | null;
      shareAmountMinor: number;
    }>;
  },
  currentUserId?: string | null,
  requestToken?: string,
) {
  const joinedCount = group.participants.filter(
    (participant) => participant.status !== "cancelled",
  ).length;

  const currentParticipant = currentUserId
    ? group.participants.find(
        (participant) => participant.userId === currentUserId,
      )
    : null;

  let frozenTerms: Record<string, unknown> = {};

  if (group.offerTermsSnapshot) {
    try {
      const parsed = JSON.parse(group.offerTermsSnapshot);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        frozenTerms = parsed as Record<string, unknown>;
      }
    } catch {
      frozenTerms = {};
    }
  }

  const frozenTitle =
    typeof frozenTerms.title === "string"
      ? frozenTerms.title
      : group.config.offer.title;

  const frozenTitleEn =
    typeof frozenTerms.titleEn === "string" || frozenTerms.titleEn === null
      ? (frozenTerms.titleEn as string | null)
      : group.config.offer.titleEn;

  const frozenSpecialPrice =
    typeof frozenTerms.specialPrice === "number" &&
    Number.isFinite(frozenTerms.specialPrice)
      ? frozenTerms.specialPrice
      : group.priceSnapshotMinor / 100;

  const frozenSessionsCount =
    typeof frozenTerms.sessionsCount === "number"
      ? frozenTerms.sessionsCount
      : frozenTerms.sessionsCount === null
        ? null
        : group.config.offer.sessionsCount;

  const frozenDurationDays =
    typeof frozenTerms.durationDays === "number"
      ? frozenTerms.durationDays
      : frozenTerms.durationDays === null
        ? null
        : group.config.offer.durationDays;

  return {
    id: group.id,
    token: currentParticipant ? group.inviteToken : (requestToken ?? group.inviteToken),
    individualInvitesEnabled: group.individualInvitesEnabled,
    status: group.status,
    expiresAt: group.expiresAt,
    requiredMembers: group.config.requiredMembers,
    matchingEnabled: group.matchingEnabled,
    joinedCount,
    remainingPlaces: Math.max(0, group.config.requiredMembers - joinedCount),
    ready: group.status === "ready" || group.status === "completed",
    currentParticipant: currentParticipant
      ? {
          role: currentParticipant.role,
          status: currentParticipant.status,
          userMembershipId: currentParticipant.userMembershipId,
          shareAmountMinor: currentParticipant.shareAmountMinor,
        }
      : null,
    offer: {
      id: group.config.offer.id,
      title: frozenTitle,
      titleEn: frozenTitleEn,
      specialPrice: frozenSpecialPrice,
      sessionsCount: frozenSessionsCount,
      durationDays: frozenDurationDays,
      expiresAt: group.config.offer.expiresAt,
      requiresEgyptianNationalId:
        group.config.offer.requiresEgyptianNationalId,
    },
  };
}

async function loadGroupByToken(token: string) {
  const directGroup = await db.friendOfferGroup.findUnique({
    where: { inviteToken: token },
    select: { id: true, individualInvitesEnabled: true },
  });
  const singleLink = directGroup ? null :
    await db.friendOfferInviteLink.findUnique({
      where: { token },
      select: { groupId: true, status: true, expiresAt: true },
    });
  if (!directGroup &&
      (singleLink?.status !== "pending" ||
       singleLink.expiresAt.getTime() <= Date.now())) return null;
  if (directGroup?.individualInvitesEnabled) {
    // Group tokens are for internal checkout only, never for new invitations.
    const user = await getCurrentAppUser().catch(() => null);
    const own = user && await db.friendOfferParticipant.findFirst({
      where: { groupId: directGroup.id, userId: user.id, status: { not: "cancelled" } },
      select: { id: true },
    });
    if (!own) return null;
  }
  const groupId = directGroup?.id ?? singleLink!.groupId;
  return db.friendOfferGroup.findUnique({
    where: { id: groupId },
    include: {
      config: {
        include: {
          offer: {
            select: {
              id: true,
              membershipId: true,
              title: true,
              titleEn: true,
              specialPrice: true,
              sessionsCount: true,
              durationDays: true,
              expiresAt: true,
              isActive: true,
              requiresEgyptianNationalId: true,
            },
          },
        },
      },
      participants: {
        select: {
          userId: true,
          role: true,
          status: true,
          userMembershipId: true,
          shareAmountMinor: true,
        },
      },
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json(
      { error: "رمز دعوة عرض الصحاب مطلوب." },
      { status: 400 },
    );
  }

  const currentUser = await getCurrentAppUser().catch(() => null);
  const group = await loadGroupByToken(token);

  if (!group) {
    return NextResponse.json(
      { error: "دعوة عرض الصحاب غير موجودة." },
      { status: 404 },
    );
  }

  const now = new Date();

  const hasEconomicCommitment = group.participants.some(
    (participant) =>
      participant.status === "paid" || participant.status === "activated",
  );

  if (
    group.status === "waiting" &&
    group.expiresAt.getTime() <= now.getTime() &&
    !hasEconomicCommitment
  ) {
    await db.friendOfferGroup.updateMany({
      where: {
        id: group.id,
        status: "waiting",
        expiresAt: { lte: now },
      },
      data: { status: "expired" },
    });

    group.status = "expired";
  }

  return NextResponse.json(publicGroupShape(group, currentUser?.id ?? null, token));
}

export async function POST(req: Request) {
  const currentUser = await getCurrentAppUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول أولًا." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    action?: "create" | "join";
    offerId?: string;
    token?: string;
    matchingEnabled?: boolean;
    egyptianNationalId?: string;
  } | null;

  if (!body?.action) {
    return NextResponse.json({ error: "نوع العملية مطلوب." }, { status: 400 });
  }

  if (body.action === "create") {
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";

    if (!offerId) {
      return NextResponse.json(
        { error: "معرف عرض الصحاب مطلوب." },
        { status: 400 },
      );
    }

    const now = new Date();

    const config = await db.friendOfferConfig.findUnique({
      where: { offerId },
      include: {
        offer: {
          select: {
            id: true,
            membershipId: true,
            title: true,
            titleEn: true,
            type: true,
            discount: true,
            description: true,
            descriptionEn: true,
            expiresAt: true,
            isActive: true,
            specialPrice: true,
            sessionsCount: true,
            durationDays: true,
            priceBefore: true,
            features: true,
            featuresEn: true,
            requiresBirthDate: true,
            requiresEgyptianNationalId: true,
            minAgeYears: true,
            maxAgeYears: true,
          },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { error: "عرض الصحاب غير متاح حاليًا." },
        { status: 400 },
      );
    }

    // A group with real economic commitment must remain recoverable.
    // Never strand a paid participant merely because the invite or
    // public offer later expires/is disabled.
    const committedExisting = await db.friendOfferGroup.findFirst({
      where: {
        configId: config.id,
        creatorUserId: currentUser.id,
        status: { in: ["waiting", "ready"] },
        participants: {
          some: {
            status: { in: ["paid", "activated"] },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (committedExisting) {
      const loaded = await loadGroupByToken(committedExisting.inviteToken);

      if (!loaded) {
        return NextResponse.json(
          { error: "تعذر تحميل مجموعة عرض الصحاب." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        reused: true,
        group: publicGroupShape(loaded, currentUser.id),
      });
    }

    const studentEligibility =
      evaluateFriendOfferStudentEligibility({
        requiresBirthDate: config.offer.requiresBirthDate,
        requiresEgyptianNationalId:
          config.offer.requiresEgyptianNationalId,
        minAgeYears: config.offer.minAgeYears,
        maxAgeYears: config.offer.maxAgeYears,
        egyptianNationalId: body.egyptianNationalId,
        now,
      });

    if (!studentEligibility.eligible) {
      return NextResponse.json(
        {
          error: studentEligibility.message,
          code: studentEligibility.code,
        },
        { status: 400 },
      );
    }

    if (
      !config.isActive ||
      !config.offer.isActive ||
      config.offer.expiresAt.getTime() <= now.getTime()
    ) {
      return NextResponse.json(
        { error: "عرض الصحاب غير متاح حاليًا." },
        { status: 400 },
      );
    }

    if (
      config.requiredMembers < 2 ||
      config.requiredMembers > 10 ||
      config.inviteExpiryHours < 1 ||
      config.inviteExpiryHours > 168
    ) {
      return NextResponse.json(
        { error: "إعدادات عرض الصحاب غير صالحة." },
        { status: 409 },
      );
    }

    let priceSnapshotMinor: number;

    try {
      priceSnapshotMinor = toMinorUnits(Number(config.offer.specialPrice ?? 0));
    } catch {
      return NextResponse.json(
        { error: "سعر عرض الصحاب غير مضبوط بشكل صحيح." },
        { status: 409 },
      );
    }

    const eligibilitySnapshot = JSON.stringify(
      await getEligibilityPolicySnapshotForSource({
        type: "offer",
        id: config.offer.id,
      }),
    );

    const offerTermsSnapshot = JSON.stringify({
      offerId: config.offer.id,
      membershipId: config.offer.membershipId,
      title: config.offer.title,
      titleEn: config.offer.titleEn,
      type: config.offer.type,
      discount: config.offer.discount,
      description: config.offer.description,
      descriptionEn: config.offer.descriptionEn,
      specialPrice: config.offer.specialPrice,
      priceSnapshotMinor,
      sessionsCount: config.offer.sessionsCount,
      durationDays: config.offer.durationDays,
      priceBefore: config.offer.priceBefore,
      features: config.offer.features,
      featuresEn: config.offer.featuresEn,
      requiredMembers: config.requiredMembers,
      capturedAt: new Date().toISOString(),
    });

    const existing = await db.friendOfferGroup.findFirst({
      where: {
        configId: config.id,
        creatorUserId: currentUser.id,
        status: { in: ["waiting", "ready"] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      const loaded = await loadGroupByToken(existing.inviteToken);

      if (!loaded) {
        return NextResponse.json(
          { error: "تعذر تحميل مجموعة عرض الصحاب." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        reused: true,
        group: publicGroupShape(loaded, currentUser.id),
      });
    }

    const expiresAt = new Date(
      now.getTime() + config.inviteExpiryHours * 60 * 60 * 1000,
    );

    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
      const inviteToken = generateInviteToken();

      try {
        const group = await db.$transaction(
          async (tx) => {
            // V4 consolidated: new Friend Offer groups own independent rights.
            // Never create/attach a synthetic Membership or change Offer.membershipId.
            const resolvedOfferTermsSnapshot = JSON.stringify({
              ...(JSON.parse(offerTermsSnapshot) as Record<string, unknown>),
              bookingPatternSnapshot: JSON.stringify({
                version: 1,
                policy: resolveBookingPolicy({
                  kind: "offer",
                  durationDays: config.offer.durationDays ?? 30,
                  sessionsCount: config.offer.sessionsCount ?? null,
                }),
              }),
            });
            const created = await tx.friendOfferGroup.create({
              data: {
                configId: config.id,
                creatorUserId: currentUser.id,
                inviteToken,
                status: config.requiredMembers <= 1 ? "ready" : "waiting",
                priceSnapshotMinor,
                offerTermsSnapshot: resolvedOfferTermsSnapshot,
                eligibilitySnapshot,
                matchingEnabled: body.matchingEnabled === true,
                individualInvitesEnabled: true,
                expiresAt,
              },
            });

            await tx.friendOfferParticipant.create({
              data: {
                groupId: created.id,
                userId: currentUser.id,
                role: "creator",
                status: "joined",
                shareAmountMinor: shareMinorForIndex(
                  priceSnapshotMinor,
                  config.requiredMembers,
                  0,
                ),
              },
            });

            return created;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );

        const loaded = await loadGroupByToken(group.inviteToken);

        if (!loaded) {
          throw new Error("FRIEND_GROUP_LOAD_FAILED");
        }

        return NextResponse.json({
          success: true,
          reused: false,
          group: publicGroupShape(loaded, currentUser.id),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }

        throw error;
      }
    }

    return NextResponse.json(
      { error: "تعذر إنشاء رابط الدعوة، يرجى المحاولة مرة أخرى." },
      { status: 500 },
    );
  }

  if (body.action === "join") {
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "رمز الدعوة مطلوب." }, { status: 400 });
    }

    try {
      const result = await db.$transaction(
        async (tx) => {
          const link = await tx.friendOfferInviteLink.findUnique({
            where: { token },
          });
          const legacy = link ? null : await tx.friendOfferGroup.findUnique({
            where: { inviteToken: token },
            select: { id: true, individualInvitesEnabled: true },
          });
          // Never accept a shared group token on a new individual-invite group.
          if (!link && (!legacy || legacy.individualInvitesEnabled)) {
            return { kind: "NOT_FOUND" as const };
          }
          const groupId = link?.groupId ?? legacy!.id;
          // This lock is shared by creator invitation cancellation and
          // admin matching, protecting against oversubscription races.
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM FriendOfferGroup WHERE id = ${groupId} FOR UPDATE
          `;
          if (locked.length !== 1) return { kind: "NOT_FOUND" as const };
          if (link && (link.status !== "pending" || link.expiresAt <= new Date())) {
            return { kind: "INVITE_CANCELLED" as const };
          }
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
                      requiresBirthDate: true,
                      requiresEgyptianNationalId: true,
                      minAgeYears: true,
                      maxAgeYears: true,
                    },
                  },
                },
              },
              participants: {
                select: {
                  id: true,
                  userId: true,
                  status: true,
                },
              },
            },
          });

          if (!group) {
            return { kind: "NOT_FOUND" as const };
          }

          const now = new Date();

          const hasEconomicCommitment = group.participants.some(
            (participant) =>
              participant.status === "paid" ||
              participant.status === "activated",
          );

          if (
            (group.expiresAt.getTime() <= now.getTime() ||
              group.config.offer.expiresAt.getTime() <= now.getTime()) &&
            !hasEconomicCommitment
          ) {
            if (group.status === "waiting") {
              await tx.friendOfferGroup.updateMany({
                where: {
                  id: group.id,
                  status: "waiting",
                },
                data: { status: "expired" },
              });
            }

            return { kind: "EXPIRED" as const };
          }

          if (
            (!group.config.isActive || !group.config.offer.isActive) &&
            !hasEconomicCommitment
          ) {
            return { kind: "UNAVAILABLE" as const };
          }

          if (
            group.status === "expired" ||
            group.status === "cancelled" ||
            group.status === "completed"
          ) {
            return {
              kind:
                group.status === "completed"
                  ? ("COMPLETED" as const)
                  : ("UNAVAILABLE" as const),
            };
          }

          const existingParticipant = group.participants.find(
            (participant) => participant.userId === currentUser.id,
          );

          if (
            existingParticipant &&
            existingParticipant.status !== "cancelled"
          ) {
            return {
              kind: "ALREADY_JOINED" as const,
              token: group.inviteToken,
            };
          }

          const studentEligibility =
            evaluateFriendOfferStudentEligibility({
              requiresBirthDate:
                group.config.offer.requiresBirthDate,
              requiresEgyptianNationalId:
                group.config.offer.requiresEgyptianNationalId,
              minAgeYears: group.config.offer.minAgeYears,
              maxAgeYears: group.config.offer.maxAgeYears,
              egyptianNationalId: body.egyptianNationalId,
              now,
            });

          if (!studentEligibility.eligible) {
            return {
              kind: "STUDENT_NOT_ELIGIBLE" as const,
              message: studentEligibility.message,
              code: studentEligibility.code,
            };
          }

          const activeParticipants = group.participants.filter(
            (participant) => participant.status !== "cancelled",
          ).length;

          if (activeParticipants >= group.config.requiredMembers) {
            if (group.status === "waiting") {
              await tx.friendOfferGroup.updateMany({
                where: {
                  id: group.id,
                  status: "waiting",
                },
                data: { status: "ready" },
              });
            }

            return { kind: "FULL" as const };
          }

          if (existingParticipant) {
            await tx.friendOfferParticipant.update({
              where: { id: existingParticipant.id },
              data: {
                status: "joined",
                joinedAt: now,
                shareAmountMinor: shareMinorForIndex(
                  group.priceSnapshotMinor,
                  group.config.requiredMembers,
                  activeParticipants,
                ),
              },
            });
          } else {
            await tx.friendOfferParticipant.create({
              data: {
                groupId: group.id,
                userId: currentUser.id,
                role: "invited",
                status: "joined",
                shareAmountMinor: shareMinorForIndex(
                  group.priceSnapshotMinor,
                  group.config.requiredMembers,
                  activeParticipants,
                ),
              },
            });
          }

          if (link) {
            const accepted = await tx.friendOfferInviteLink.updateMany({
              where: { id: link.id, groupId: group.id, status: "pending", expiresAt: { gt: now } },
              data: { status: "accepted", acceptedByUserId: currentUser.id, acceptedAt: now },
            });
            if (accepted.count !== 1) throw new Error("FRIEND_SINGLE_INVITE_ALREADY_USED");
          }
          const nextCount = activeParticipants + 1;
          const nextStatus =
            nextCount >= group.config.requiredMembers ? "ready" : "waiting";

          if (group.status !== nextStatus) {
            await tx.friendOfferGroup.update({
              where: { id: group.id },
              data: { status: nextStatus },
            });
          }

          return {
            kind: "JOINED" as const,
            token: group.inviteToken,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      if (result.kind === "INVITE_CANCELLED") {
        return NextResponse.json({ error: "تم إلغاء هذه الدعوة أو انتهت صلاحيتها." }, { status: 410 });
      }
      if (result.kind === "NOT_FOUND") {
        return NextResponse.json(
          { error: "دعوة عرض الصحاب غير موجودة." },
          { status: 404 },
        );
      }

      if (result.kind === "EXPIRED") {
        return NextResponse.json(
          { error: "انتهت صلاحية دعوة عرض الصحاب." },
          { status: 410 },
        );
      }

      if (result.kind === "UNAVAILABLE") {
        return NextResponse.json(
          { error: "عرض الصحاب غير متاح حاليًا." },
          { status: 409 },
        );
      }

      if (result.kind === "COMPLETED") {
        return NextResponse.json(
          { error: "تم إكمال هذه المجموعة بالفعل." },
          { status: 409 },
        );
      }

      if (result.kind === "STUDENT_NOT_ELIGIBLE") {
        return NextResponse.json(
          { error: result.message, code: result.code },
          { status: 400 },
        );
      }

      if (result.kind === "FULL") {
        return NextResponse.json(
          { error: "اكتمل عدد المشاركين في عرض الصحاب." },
          { status: 409 },
        );
      }

      if (!("token" in result) || !result.token) {
        return NextResponse.json(
          { error: "تعذر تحديد مجموعة عرض الصحاب." },
          { status: 500 },
        );
      }

      const loaded = await loadGroupByToken(result.token);

      if (!loaded) {
        return NextResponse.json(
          { error: "تعذر تحميل مجموعة عرض الصحاب." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        alreadyJoined: result.kind === "ALREADY_JOINED",
        group: publicGroupShape(loaded, currentUser.id),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        return NextResponse.json(
          {
            error: "حدث تعارض أثناء الانضمام للمجموعة، يرجى المحاولة مرة أخرى.",
          },
          { status: 409 },
        );
      }

      console.error("[FRIEND_OFFERS_JOIN]", error);

      return NextResponse.json(
        { error: "تعذر الانضمام إلى عرض الصحاب حاليًا." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "عملية غير مدعومة." }, { status: 400 });
}
