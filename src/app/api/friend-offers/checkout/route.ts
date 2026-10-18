import { NextResponse } from "next/server";
import {
  evaluateFriendOfferStudentEligibility,
} from "@/lib/friend-offer-student-eligibility";
import { getCurrentAppUser } from "@/lib/app-session";
import { asDbTransactionClient, db } from "@/lib/db";
import { createPaymentTransaction } from "@/lib/payments/service";
import {
  FriendOfferCarryoverPreviewError,
  previewFriendOfferCarryoverForCustomer,
} from "@/lib/payments/friend-offer-carryover-preview";
import {
  lockMarketingConversionForFriendOfferTx,
  releaseMarketingFriendOfferLockTx,
} from "@/lib/marketing-conversion-service";

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();

    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولًا." },
        { status: 401 },
      );
    }

    const verificationUser = await db.user.findUnique({
      where: { id: currentUser.id },
      select: { emailVerified: true },
    });

    if (!verificationUser?.emailVerified) {
      return NextResponse.json(
        {
          error: "يجب تفعيل الحساب أولًا قبل إتمام الاشتراك.",
          needsVerification: true,
        },
        { status: 403 },
      );
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim() ?? "";

    const carryover = await previewFriendOfferCarryoverForCustomer(
      currentUser.id,
      token,
    );

    return NextResponse.json({
      success: true,
      carryover,
    });
  } catch (error) {
    if (error instanceof FriendOfferCarryoverPreviewError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("[FRIEND_OFFER_CARRYOVER_PREVIEW]", error);

    return NextResponse.json(
      { error: "تعذر التحقق من رصيد الجلسات المرحل حاليًا." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();

    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولًا." },
        { status: 401 },
      );
    }

    const verificationUser = await db.user.findUnique({
      where: { id: currentUser.id },
      select: { emailVerified: true },
    });

    if (!verificationUser?.emailVerified) {
      console.info(
        "[FRIEND_CHECKOUT_VERIFICATION] Blocked unverified account",
        { userId: currentUser.id },
      );

      return NextResponse.json(
        {
          error: "يجب تفعيل الحساب أولًا قبل إتمام الاشتراك.",
          needsVerification: true,
        },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => null)) as {
      token?: string;
      returnUrl?: string;
      cancelUrl?: string;
      egyptianNationalId?: string;
    } | null;

    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json(
        { error: "رمز مجموعة عرض الصحاب مطلوب." },
        { status: 400 },
      );
    }

    const group = await db.friendOfferGroup.findUnique({
      where: { inviteToken: token },
      include: {
        config: {
          include: {
            offer: {
              select: {
                id: true,
                title: true,
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
            shareAmountMinor: true,
            paymentTransactionId: true,
            attributionSnapshot: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!group) {
      return NextResponse.json(
        { error: "مجموعة عرض الصحاب غير موجودة." },
        { status: 404 },
      );
    }

    const now = new Date();

    const hasEconomicCommitment = group.participants.some(
      (row) => row.status === "paid" || row.status === "activated",
    );

    const mutableTermsUnavailable =
      group.status === "expired" ||
      group.expiresAt.getTime() <= now.getTime() ||
      !group.config.isActive ||
      !group.config.offer.isActive ||
      group.config.offer.expiresAt.getTime() <= now.getTime();

    if (
      group.status === "cancelled" ||
      group.status === "completed" ||
      (!hasEconomicCommitment && mutableTermsUnavailable)
    ) {
      return NextResponse.json(
        { error: "مجموعة عرض الصحاب غير متاحة للدفع حاليًا." },
        { status: 409 },
      );
    }

    const participant = group.participants.find(
      (row) => row.userId === currentUser.id,
    );

    if (!participant || participant.status === "cancelled") {
      return NextResponse.json(
        { error: "أنتِ لستِ مشاركة فعالة في هذه المجموعة." },
        { status: 403 },
      );
    }

    if (
      participant.status !== "paid" &&
      participant.status !== "activated"
    ) {
      const studentEligibility =
        evaluateFriendOfferStudentEligibility({
          requiresBirthDate:
            group.config.offer.requiresBirthDate,
          requiresEgyptianNationalId:
            group.config.offer.requiresEgyptianNationalId,
          minAgeYears: group.config.offer.minAgeYears,
          maxAgeYears: group.config.offer.maxAgeYears,
          egyptianNationalId: body?.egyptianNationalId,
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
    }

    /*
     * Recover a saved checkout after an interrupted response/link.
     * Never create a second Paymob intention while a claim is unresolved.
     */
    if (
      participant.status === "checkout_claiming" &&
      participant.paymentTransactionId === null
    ) {
      const claimTime = participant.updatedAt?.getTime();

      if (
        !Number.isFinite(claimTime) ||
        claimTime > now.getTime() ||
        now.getTime() - claimTime < 60_000
      ) {
        return NextResponse.json(
          {
            error: "محاولة الدفع الأولى لا تزال قيد التجهيز.",
            code: "FRIEND_CHECKOUT_PREPARATION_IN_PROGRESS",
          },
          { status: 409 },
        );
      }

      const candidates = await db.paymentTransaction.findMany({
        where: {
          userId: currentUser.id,
          offerId: group.config.offer.id,
          membershipId: null,
          purpose: "membership",
          provider: "paymob",
          createdAt: {
            gte: new Date(claimTime - 10_000),
          },
          metadata: {
            contains: `"friendParticipantId":"${participant.id}"`,
          },
        },
        select: {
          id: true,
          userId: true,
          membershipId: true,
          offerId: true,
          status: true,
          amount: true,
          currency: true,
          metadata: true,
          checkoutUrl: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      });

      const matching = candidates.filter((payment) => {
        let metadata: Record<string, unknown> | null = null;
        try {
          const value = JSON.parse(payment.metadata ?? "");
          if (value && typeof value === "object" &&
              !Array.isArray(value)) {
            metadata = value as Record<string, unknown>;
          }
        } catch {
          return false;
        }

        return (
          payment.userId === currentUser.id &&
          payment.offerId === group.config.offer.id &&
          payment.membershipId === null &&
          payment.currency === "EGP" &&
          Number.isFinite(payment.amount) &&
          Math.abs(
            payment.amount * 100 -
            participant.shareAmountMinor
          ) < 0.000001 &&
          metadata?.source === "friend-offer" &&
          metadata.friendGroupId === group.id &&
          metadata.friendParticipantId === participant.id &&
          metadata.friendShareAmountMinor ===
            participant.shareAmountMinor
        );
      });

      if (matching.length !== 1) {
        return NextResponse.json(
          {
            error:
              "تعذر تحديد جلسة الدفع الأصلية بشكل قاطع. يلزم مراجعتها قبل إنشاء دفع جديد.",
            code: "FRIEND_CHECKOUT_REMOTE_RECONCILIATION_REQUIRED",
          },
          { status: 409 },
        );
      }

      const payment = matching[0];

      if (
        !["pending", "requires_action"].includes(payment.status) ||
        !payment.checkoutUrl ||
        !payment.expiresAt ||
        !Number.isFinite(payment.expiresAt.getTime()) ||
        payment.expiresAt.getTime() <= now.getTime()
      ) {
        return NextResponse.json(
          {
            error:
              "تم العثور على معاملة دفع أصلية تحتاج مراجعة حالتها قبل المتابعة.",
            code: "FRIEND_CHECKOUT_PAYMENT_STATE_REVIEW_REQUIRED",
          },
          { status: 409 },
        );
      }

      const linked = await db.friendOfferParticipant.updateMany({
        where: {
          id: participant.id,
          groupId: group.id,
          userId: currentUser.id,
          paymentTransactionId: null,
          status: "checkout_claiming",
        },
        data: {
          paymentTransactionId: payment.id,
          status: "checkout_started",
        },
      });

      if (linked.count !== 1) {
        return NextResponse.json(
          {
            error: "تغيرت حالة عملية الدفع. يرجى إعادة تحميل العرض.",
            code: "FRIEND_CHECKOUT_RECOVERY_RACE",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({
        success: true,
        reused: true,
        recovered: true,
        paymentTransactionId: payment.id,
        status: payment.status,
        checkoutUrl: payment.checkoutUrl,
        amount: payment.amount,
      });
    }

    if (participant.paymentTransactionId) {
      const existingPayment = await db.paymentTransaction.findUnique({
        where: { id: participant.paymentTransactionId },
      });

      if (existingPayment) {
        if (
          existingPayment.status === "pending" ||
          existingPayment.status === "requires_action" ||
          existingPayment.status === "paid"
        ) {
          if (existingPayment.status !== "paid") {
            const expiresAt = existingPayment.expiresAt;

            if (
              !existingPayment.checkoutUrl ||
              !(expiresAt instanceof Date) ||
              !Number.isFinite(expiresAt.getTime()) ||
              expiresAt.getTime() <= now.getTime()
            ) {
              return NextResponse.json(
                {
                  error:
                    "جلسة الدفع السابقة غير صالحة للاستخدام. يلزم مراجعة حالة المعاملة قبل إعادة المحاولة.",
                  code: "FRIEND_CHECKOUT_LINK_RECONCILIATION_REQUIRED",
                },
                { status: 409 },
              );
            }
          }

          return NextResponse.json({
            success: true,
            reused: true,
            paymentTransactionId: existingPayment.id,
            status: existingPayment.status,
            checkoutUrl:
              existingPayment.status === "paid"
                ? null
                : existingPayment.checkoutUrl,
            amount: existingPayment.amount,
          });
        }

        if (
          existingPayment.status === "failed" ||
          existingPayment.status === "cancelled" ||
          existingPayment.status === "expired"
        ) {
          const released = await db.$transaction(async (tx) => {
            const participantRelease =
              await tx.friendOfferParticipant.updateMany({
                where: {
                  id: participant.id,
                  userId: currentUser.id,
                  paymentTransactionId: existingPayment.id,
                  status: {
                    in: ["joined", "checkout_started"],
                  },
                },
                data: {
                  paymentTransactionId: null,
                  status: "joined",
                },
              });

            if (participantRelease.count === 1) {
              await releaseMarketingFriendOfferLockTx(
                asDbTransactionClient(tx),
                participant.id,
              );
            }

            return participantRelease;
          });

          if (released.count !== 1) {
            return NextResponse.json(
              {
                error: "تغيرت حالة محاولة الدفع، يرجى إعادة المحاولة.",
              },
              { status: 409 },
            );
          }

          participant.paymentTransactionId = null;
          participant.status = "joined";
        } else {
          return NextResponse.json(
            {
              error: "حالة معاملة الدفع الحالية لا تسمح بإنشاء محاولة جديدة.",
            },
            { status: 409 },
          );
        }
      }
    }

    let carryover;

    try {
      carryover = await previewFriendOfferCarryoverForCustomer(
        currentUser.id,
        token,
        now,
      );
    } catch (error) {
      if (error instanceof FriendOfferCarryoverPreviewError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }

      throw error;
    }

    if (carryover.blocking) {
      return NextResponse.json(
        {
          error:
            "لا يمكن بدء عملية دفع جديدة قبل مراجعة تعارض ترحيل الجلسات الحالي.",
          carryover,
        },
        { status: 409 },
      );
    }

    let attributionSnapshot = participant.attributionSnapshot;

    if (!attributionSnapshot) {
      const userRecord = await db.user.findUnique({
        where: { id: currentUser.id },
        select: {
          pendingPartnerRef: true,
          pendingAgentRef: true,
          pendingStaffRef: true,
          pendingTrainerRef: true,
          pendingNutritionRef: true,
        },
      });

      const snapshot: Record<string, string | null> = {
        partnerId: null,
        partnerCodeId: null,
        affiliateLinkId: null,
        salesAgentUserId: null,
        salesAgentId: null,
        staffReferralLinkId: null,
        trainerReferralLinkId: null,
        nutritionReferralLinkId: null,
      };

      const partnerToken = String(userRecord?.pendingPartnerRef ?? "")
        .trim()
        .toUpperCase();

      if (partnerToken) {
        const row = await db.partnerAffiliateLink.findUnique({
          where: { token: partnerToken },
          select: { id: true, partnerId: true, isActive: true },
        });

        if (row?.isActive) {
          snapshot.partnerId = row.partnerId;
          snapshot.affiliateLinkId = row.id;
        }
      }

      const agentCode = String(userRecord?.pendingAgentRef ?? "")
        .trim()
        .toUpperCase();

      if (agentCode) {
        const row = await db.salesAgent.findUnique({
          where: { referralCode: agentCode },
          select: { id: true, isActive: true },
        });

        if (row?.isActive) {
          snapshot.salesAgentId = row.id;
        }
      }

      const staffToken = String(userRecord?.pendingStaffRef ?? "")
        .trim()
        .toUpperCase();

      if (staffToken) {
        const row = await db.staffReferralLink.findUnique({
          where: { token: staffToken },
          select: { id: true, isActive: true },
        });

        if (row?.isActive) {
          snapshot.staffReferralLinkId = row.id;
        }
      }

      const trainerToken = String(userRecord?.pendingTrainerRef ?? "")
        .trim()
        .toUpperCase();

      if (trainerToken) {
        const row = await db.trainerReferralLink.findUnique({
          where: { token: trainerToken },
          select: { id: true, isActive: true },
        });

        if (row?.isActive) {
          snapshot.trainerReferralLinkId = row.id;
        }
      }

      const nutritionToken = String(userRecord?.pendingNutritionRef ?? "")
        .trim()
        .toUpperCase();

      if (nutritionToken) {
        const row = await db.nutritionReferralLink.findUnique({
          where: { token: nutritionToken },
          select: { id: true, isActive: true },
        });

        if (row?.isActive) {
          snapshot.nutritionReferralLinkId = row.id;
        }
      }

      attributionSnapshot = JSON.stringify(snapshot);

      const frozen = await db.friendOfferParticipant.updateMany({
        where: {
          id: participant.id,
          attributionSnapshot: null,
        },
        data: {
          attributionSnapshot,
        },
      });

      if (frozen.count === 0) {
        const winner = await db.friendOfferParticipant.findUnique({
          where: { id: participant.id },
          select: { attributionSnapshot: true },
        });

        attributionSnapshot =
          winner?.attributionSnapshot ?? attributionSnapshot;
      }
    }

    const amount = participant.shareAmountMinor / 100;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "قيمة نصيب المشاركة غير صالحة." },
        { status: 409 },
      );
    }

    /*
     * Claim this participant BEFORE creating a Paymob intention.
     * The database CAS ensures that at most one concurrent request
     * can reach the external payment provider.
     */
    const claim = await db.$transaction(async (tx) => {
      const reserved = await tx.friendOfferParticipant.updateMany({
        where: {
          id: participant.id,
          groupId: group.id,
          userId: currentUser.id,
          paymentTransactionId: null,
          status: { in: ["joined", "checkout_started"] },
        },
        data: { status: "checkout_claiming" },
      });

      if (reserved.count === 1) {
        await lockMarketingConversionForFriendOfferTx(
          asDbTransactionClient(tx),
          {
            customerId: currentUser.id,
            friendOfferParticipantId: participant.id,
            commissionBase: amount,
          },
        );
      }

      return reserved;
    });

    if (claim.count !== 1) {
      return NextResponse.json(
        {
          error:
            "هناك محاولة دفع قيد التجهيز لهذه الحصة. يرجى عدم إنشاء محاولة أخرى.",
          code: "FRIEND_OFFER_CHECKOUT_ALREADY_CLAIMED",
        },
        { status: 409 },
      );
    }

    let transaction: Awaited<
      ReturnType<typeof createPaymentTransaction>
    >;

    try {
      transaction = await createPaymentTransaction({
      userId: currentUser.id,
      provider: "paymob",
      purpose: "membership",
      businessUnit: "club",
      amount,
      paymentMethod: "paymob",
      membershipId: null,
      friendOfferShare: true,
      offerId: group.config.offer.id,
      returnUrl: body?.returnUrl ?? null,
      cancelUrl: body?.cancelUrl ?? null,
      description: `Friend offer share - ${group.config.offer.title}`,
      metadata: {
        source: "friend-offer",
        friendGroupId: group.id,
        friendParticipantId: participant.id,
        friendInviteToken: group.inviteToken,
        friendShareAmountMinor: participant.shareAmountMinor,
        friendAttributionSnapshot: attributionSnapshot,
      },
      customer: {
        name: currentUser.name,
        email: currentUser.email,
        phone: null,
      },
    });
    } catch (error) {
      /*
       * Do NOT release the claim automatically.
       * The provider may have created an intention before a network
       * or database failure became visible to this request.
       * Reconciliation must establish finality before a new attempt.
       */
      console.error("[FRIEND_CHECKOUT_PROVIDER_PREPARATION]", error);
      return NextResponse.json(
        {
          error:
            "تعذر تأكيد تجهيز الدفع. يرجى التواصل مع الإدارة قبل إعادة المحاولة.",
          code: "FRIEND_OFFER_CHECKOUT_RECONCILIATION_REQUIRED",
        },
        { status: 503 },
      );
    }

    /*
     * Link the unique payment to the previously claimed participant.
     * Never silently cancel an already-created Paymob intention.
     */
    let linked;

    try {
      linked = await db.friendOfferParticipant.updateMany({
        where: {
          id: participant.id,
          groupId: group.id,
          userId: currentUser.id,
          paymentTransactionId: null,
          status: "checkout_claiming",
        },
        data: {
          paymentTransactionId: transaction.id,
          status: "checkout_started",
        },
      });
    } catch (error) {
      console.error("[FRIEND_CHECKOUT_LINK_RECONCILIATION]", error);
      return NextResponse.json(
        {
          error:
            "عملية الدفع تحتاج مراجعة قبل إعادة المحاولة.",
          code: "FRIEND_OFFER_PAYMENT_LINK_RECONCILIATION_REQUIRED",
        },
        { status: 503 },
      );
    }

    if (linked.count !== 1) {
      return NextResponse.json(
        {
          error:
            "تغيرت حالة ربط عملية الدفع. يرجى مراجعة الإدارة قبل إعادة المحاولة.",
          code: "FRIEND_OFFER_PAYMENT_LINK_CONFLICT",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      reused: false,
      paymentTransactionId: transaction.id,
      status: transaction.status,
      checkoutUrl: transaction.checkoutUrl,
      amount: transaction.amount,
      carryover,
    });
  } catch (error) {
    console.error("[FRIEND_OFFER_CHECKOUT]", error);

    const message =
      error instanceof Error
        ? error.message
        : "تعذر بدء دفع عرض الصحاب حاليًا.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
