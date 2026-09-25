import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { asDbTransactionClient, db } from "@/lib/db";
import { createPaymentTransaction } from "@/lib/payments/service";
import {
  lockMarketingConversionForFriendOfferTx,
  releaseMarketingFriendOfferLockTx,
} from "@/lib/marketing-conversion-service";

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
          return NextResponse.json({
            success: true,
            reused: true,
            paymentTransactionId: existingPayment.id,
            status: existingPayment.status,
            checkoutUrl: existingPayment.checkoutUrl,
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

    const transaction = await createPaymentTransaction({
      userId: currentUser.id,
      provider: "paymob",
      purpose: "membership",
      businessUnit: "club",
      amount,
      paymentMethod: "paymob",
      membershipId: null,
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

    let linked;

    try {
      linked = await db.$transaction(async (tx) => {
        const participantClaim =
          await tx.friendOfferParticipant.updateMany({
            where: {
              id: participant.id,
              userId: currentUser.id,
              paymentTransactionId: null,
              status: {
                in: ["joined", "checkout_started"],
              },
            },
            data: {
              paymentTransactionId: transaction.id,
              status: "checkout_started",
            },
          });

        if (participantClaim.count === 1) {
          await lockMarketingConversionForFriendOfferTx(
            asDbTransactionClient(tx),
            {
              customerId: currentUser.id,
              friendOfferParticipantId: participant.id,
              commissionBase: amount,
            },
          );
        }

        return participantClaim;
      });
    } catch (error) {
      /*
       * Payment creation occurs before the participant DB claim.
       * If the participant+marketing atomic phase fails, do not
       * leave a fresh pending payment orphaned.
       */
      await db.paymentTransaction.updateMany({
        where: {
          id: transaction.id,
          status: {
            in: ["pending", "requires_action"],
          },
        },
        data: {
          status: "cancelled",
        },
      });

      throw error;
    }

    if (linked.count !== 1) {
      const winner = await db.friendOfferParticipant.findUnique({
        where: { id: participant.id },
        select: {
          paymentTransactionId: true,
        },
      });

      if (
        winner?.paymentTransactionId &&
        winner.paymentTransactionId !== transaction.id
      ) {
        await db.paymentTransaction.updateMany({
          where: {
            id: transaction.id,
            status: {
              in: ["pending", "requires_action"],
            },
          },
          data: {
            status: "cancelled",
          },
        });

        const existingPayment = await db.paymentTransaction.findUnique({
          where: { id: winner.paymentTransactionId },
        });

        if (existingPayment) {
          return NextResponse.json({
            success: true,
            reused: true,
            paymentTransactionId: existingPayment.id,
            status: existingPayment.status,
            checkoutUrl: existingPayment.checkoutUrl,
            amount: existingPayment.amount,
          });
        }
      }

      return NextResponse.json(
        { error: "تعذر ربط عملية الدفع بالمشاركة." },
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
