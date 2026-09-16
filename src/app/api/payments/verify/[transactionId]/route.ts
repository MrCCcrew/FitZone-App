import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { maybeFinalizeFriendOfferPayment } from "@/lib/payments/friend-offer-finalization";
import {
  recoverPaidMembershipActivation,
  verifyPaymentTransaction,
} from "@/lib/payments/service";

export async function GET(req: Request, context: { params: Promise<{ transactionId: string }> }) {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const { transactionId } = await context.params;
    const transaction = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, userId: true, status: true, purpose: true },
    });

    if (!transaction || transaction.userId !== user.id) {
      return NextResponse.json({ error: "معاملة الدفع غير موجودة." }, { status: 404 });
    }

    // Wallet credits are finalized only by an authenticated provider webhook.
    // The browser return URL is intentionally read-only for wallet top-ups.
    if (transaction.purpose === "wallet_topup") {
      return NextResponse.json({ success: true, transaction });
    }

    // The browser return state is informational only.
    // Never mutate payment state solely because the customer returned through
    // Paymob's cancel URL. The provider/webhook/server verification remains
    // the source of truth for the financial status.
    const state = new URL(req.url).searchParams.get("state");
    if (state === "cancel") {
      console.info(
        `[PAYMENTS_VERIFY_GET] User returned from Paymob cancel flow for ${transactionId}; verifying provider state before any financial decision.`,
      );
    }

    let result = await verifyPaymentTransaction(transactionId);

    // Friend Offer payments have no normal membership link until the
    // whole group is ready. Finalize that flow before normal membership recovery.
    if (result.status === "paid" && transaction.purpose === "membership") {
      const friendFinalization =
        await maybeFinalizeFriendOfferPayment(transactionId);

      if (friendFinalization.kind === "friend_offer") {
        return NextResponse.json({
          success: true,
          transaction: result,
          friendOffer: {
            groupId: friendFinalization.groupId,
            status: friendFinalization.status,
          },
        });
      }

      // A normal paid membership payment is not complete until the linked
      // UserMembership is actually active.
      const linkedPayment = await db.paymentTransaction.findUnique({
        where: { id: transactionId },
        select: { membershipId: true },
      });

      if (linkedPayment?.membershipId) {
        let membership = await db.userMembership.findUnique({
          where: { id: linkedPayment.membershipId },
          select: { status: true },
        });

        if (membership?.status === "pending_payment") {
          result = await recoverPaidMembershipActivation(transactionId);

          membership = await db.userMembership.findUnique({
            where: { id: linkedPayment.membershipId },
            select: { status: true },
          });
        }

        if (!membership || membership.status !== "active") {
          console.error(
            `[PAYMENTS_VERIFY_GET] Payment ${transactionId} is paid but membership ${linkedPayment.membershipId} is ${membership?.status ?? "missing"}`,
          );

          return NextResponse.json(
            {
              error:
                "تم تأكيد الدفع، لكن تفعيل الاشتراك لم يكتمل تلقائيًا. لم يتم اعتبار الاشتراك نشطًا بعد ويحتاج إلى مراجعة.",
              code: "PAID_MEMBERSHIP_NOT_ACTIVE",
            },
            { status: 409 },
          );
        }
      }
    }

    return NextResponse.json({ success: true, transaction: result });
  } catch (error) {
    console.error("[PAYMENTS_VERIFY_GET]", error);
    const message = error instanceof Error ? error.message : "تعذر التحقق من حالة الدفع.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
