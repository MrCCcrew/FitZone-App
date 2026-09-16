import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import {
  createPaymentTransaction,
  updatePaymentTransactionStatus,
} from "@/lib/payments/service";
import { getPaymentProvider } from "@/lib/payments/registry";

const ACTIVE_STATUSES = new Set([
  "pending",
  "requires_action",
  "processing",
]);

const TERMINAL_FAILURE_STATUSES = new Set([
  "failed",
  "cancelled",
  "expired",
]);

const RETRY_CLAIM_STATUS = "retrying";
const RETRY_CLAIM_STALE_MS = 2 * 60 * 1000;

function parseJson(value: string | null | undefined) {
  if (!value) return null;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeMetadata(
  value: string | null | undefined,
): Record<string, unknown> {
  return parseJson(value) ?? {};
}

export async function POST(req: Request) {
  const currentUser = await getCurrentAppUser();

  if (!currentUser?.id) {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول أولًا." },
      { status: 401 },
    );
  }

  let body: { orderId?: string };

  try {
    body = (await req.json()) as { orderId?: string };
  } catch {
    return NextResponse.json(
      { error: "بيانات الطلب غير صالحة." },
      { status: 400 },
    );
  }

  const orderId = String(body.orderId ?? "").trim();

  if (!orderId) {
    return NextResponse.json(
      { error: "الطلب غير محدد." },
      { status: 400 },
    );
  }

  const order = await db.order.findFirst({
    where: {
      id: orderId,
      userId: currentUser.id,
      businessUnit: "store",
    },
    select: {
      id: true,
      userId: true,
      status: true,
      inventoryDeducted: true,
      paymentMethod: true,
      total: true,
      inventoryAllocations: {
        select: {
          id: true,
          status: true,
          quantity: true,
        },
      },
      paymentTransactions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          userId: true,
          orderId: true,
          purpose: true,
          businessUnit: true,
          provider: true,
          status: true,
          amount: true,
          currency: true,
          paymentMethod: true,
          checkoutUrl: true,
          returnUrl: true,
          cancelUrl: true,
          providerReference: true,
          externalReference: true,
          providerPayload: true,
          metadata: true,
          expiresAt: true,
          paidAt: true,
          failedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "الطلب غير موجود." },
      { status: 404 },
    );
  }

  if (order.status !== "pending" || order.inventoryDeducted) {
    return NextResponse.json(
      {
        error:
          order.status === "confirmed"
            ? "تم تأكيد هذا الطلب بالفعل."
            : "هذا الطلب غير متاح لاستكمال الدفع.",
      },
      { status: 409 },
    );
  }

  if (order.paymentMethod !== "paymob") {
    return NextResponse.json(
      { error: "إعادة الدفع متاحة حاليًا للمدفوعات الإلكترونية فقط." },
      { status: 400 },
    );
  }

  const reservationExists = order.inventoryAllocations.some(
    (allocation) =>
      allocation.status === "reserved" &&
      allocation.quantity > 0,
  );

  if (!reservationExists) {
    return NextResponse.json(
      {
        error:
          "تعذر استكمال الدفع لأن حجز المنتجات لهذا الطلب لم يعد متاحًا.",
      },
      { status: 409 },
    );
  }

  const paidTransaction =
    await db.paymentTransaction.findFirst({
      where: {
        orderId: order.id,
        status: "paid",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

  if (paidTransaction) {
    await updatePaymentTransactionStatus(
      paidTransaction.id,
      "paid",
    );

    return NextResponse.json({
      success: true,
      paid: true,
      orderId: order.id,
    });
  }

  const latest = order.paymentTransactions[0];

  if (!latest) {
    return NextResponse.json(
      {
        error:
          "لا توجد محاولة دفع سابقة يمكن استكمالها بأمان لهذا الطلب.",
      },
      { status: 409 },
    );
  }

  if (
    latest.purpose !== "order" ||
    latest.provider !== "paymob" ||
    latest.orderId !== order.id ||
    latest.userId !== currentUser.id
  ) {
    return NextResponse.json(
      { error: "معاملة الدفع المرتبطة بالطلب غير صالحة." },
      { status: 409 },
    );
  }

  if (latest.status === "paid") {
    await updatePaymentTransactionStatus(latest.id, "paid");

    return NextResponse.json({
      success: true,
      paid: true,
      orderId: order.id,
    });
  }

  const now = new Date();

  const sessionStillValid =
    ACTIVE_STATUSES.has(latest.status) &&
    Boolean(latest.checkoutUrl) &&
    latest.expiresAt instanceof Date &&
    latest.expiresAt.getTime() > now.getTime() + 15_000;

  if (sessionStillValid) {
    return NextResponse.json({
      success: true,
      reused: true,
      orderId: order.id,
      transactionId: latest.id,
      checkoutUrl: latest.checkoutUrl,
      expiresAt: latest.expiresAt,
    });
  }

  const latestMetadata = safeMetadata(latest.metadata);

  if (latest.status === RETRY_CLAIM_STATUS) {
    const claimAge =
      now.getTime() - latest.updatedAt.getTime();

    if (claimAge < RETRY_CLAIM_STALE_MS) {
      return NextResponse.json(
        {
          error:
            "جارٍ تجهيز جلسة دفع جديدة لهذا الطلب. يرجى المحاولة بعد لحظات.",
        },
        { status: 409 },
      );
    }
  }

  /*
   * Before creating any new checkout, remotely verify an old Paymob
   * acceptance transaction whenever we have its external reference.
   *
   * This is deliberately read-only at Paymob. We fail closed if remote
   * verification cannot be completed, preventing accidental double payment.
   */
  if (latest.externalReference) {
    const provider = getPaymentProvider("paymob");

    if (!provider?.enabled) {
      return NextResponse.json(
        {
          error:
            "خدمة الدفع الإلكتروني غير متاحة حاليًا.",
        },
        { status: 503 },
      );
    }

    let verification;

    try {
      verification =
        await provider.verifyTransaction({
          id: latest.id,
          providerReference:
            latest.providerReference,
          externalReference:
            latest.externalReference,
          amount: latest.amount,
          currency: latest.currency,
          metadata: latest.metadata,
          providerPayload:
            latest.providerPayload,
        });
    } catch (error) {
      console.error(
        "[STORE_PAYMENT_RETRY_VERIFY]",
        error,
      );

      return NextResponse.json(
        {
          error:
            "تعذر التحقق من حالة عملية الدفع السابقة حاليًا. لم يتم إنشاء عملية دفع جديدة. يرجى المحاولة مرة أخرى.",
        },
        { status: 503 },
      );
    }

    if (verification.status === "paid") {
      await updatePaymentTransactionStatus(
        latest.id,
        "paid",
      );

      return NextResponse.json({
        success: true,
        paid: true,
        orderId: order.id,
      });
    }

    if (
      verification.status === "pending" ||
      verification.status ===
        "requires_action"
    ) {
      return NextResponse.json(
        {
          error:
            "عملية الدفع السابقة ما زالت قيد المعالجة لدى Paymob. لم يتم إنشاء عملية دفع جديدة لتجنب تكرار الخصم.",
        },
        { status: 409 },
      );
    }
  }

  /*
   * Atomic retry claim.
   *
   * Two simultaneous clicks cannot both create a replacement checkout
   * from the same prior transaction.
   */
  const previousStatus =
    latest.status === RETRY_CLAIM_STATUS
      ? String(
          latestMetadata
            .storeRetryPreviousStatus ??
            "pending",
        )
      : latest.status;

  const claimMetadata = {
    ...latestMetadata,
    storeRetryClaimedAt:
      now.toISOString(),
    storeRetryPreviousStatus:
      previousStatus,
  };

  const claim =
    await db.paymentTransaction.updateMany({
      where: {
        id: latest.id,
        status: latest.status,
        updatedAt: latest.updatedAt,
      },
      data: {
        status: RETRY_CLAIM_STATUS,
        metadata: JSON.stringify(
          claimMetadata,
        ),
      },
    });

  if (claim.count !== 1) {
    return NextResponse.json(
      {
        error:
          "تم بدء محاولة أخرى لاستكمال الدفع لهذا الطلب. يرجى المحاولة بعد لحظات.",
      },
      { status: 409 },
    );
  }

  /*
   * Re-check the order after acquiring the claim. A webhook could have
   * changed the order while Paymob verification was in progress.
   */
  const currentOrder =
    await db.order.findUnique({
      where: { id: order.id },
      select: {
        status: true,
        inventoryDeducted: true,
      },
    });

  if (
    !currentOrder ||
    currentOrder.status !== "pending" ||
    currentOrder.inventoryDeducted
  ) {
    await db.paymentTransaction.updateMany({
      where: {
        id: latest.id,
        status: RETRY_CLAIM_STATUS,
      },
      data: {
        status: previousStatus,
        metadata: latest.metadata,
      },
    });

    return NextResponse.json(
      {
        error:
          "تغيرت حالة الطلب أثناء التحقق من الدفع. يرجى تحديث الصفحة.",
      },
      { status: 409 },
    );
  }

  const customer =
    await db.user.findUnique({
      where: {
        id: currentUser.id,
      },
      select: {
        name: true,
        email: true,
        phone: true,
      },
    });

  let replacement;

  try {
    replacement =
      await createPaymentTransaction({
        userId: currentUser.id,
        provider: "paymob",
        purpose: "order",
        businessUnit: "store",

        /*
         * Frozen external amount from the original checkout.
         * NEVER recalculate wallet / points / discounts during retry.
         */
        amount: latest.amount,
        currency: latest.currency,
        paymentMethod:
          latest.paymentMethod ||
          "paymob",
        orderId: order.id,
        returnUrl:
          latest.returnUrl ?? null,
        cancelUrl:
          latest.cancelUrl ?? null,
        description:
          `إعادة محاولة سداد طلب رقم ${order.id}`,
        metadata: {
          ...latestMetadata,
          storeRetryOfPaymentTransactionId:
            latest.id,
          storeRetryCreatedAt:
            new Date().toISOString(),
        },
        customer: {
          name: customer?.name ?? null,
          email: customer?.email ?? null,
          phone: customer?.phone ?? null,
        },
      });
  } catch (error) {
    console.error(
      "[STORE_PAYMENT_RETRY_CREATE]",
      error,
    );

    /*
     * Restore the prior transaction to exactly its previous state so
     * the customer is not permanently stuck on a failed retry claim.
     */
    await db.paymentTransaction
      .updateMany({
        where: {
          id: latest.id,
          status: RETRY_CLAIM_STATUS,
        },
        data: {
          status: previousStatus,
          metadata: latest.metadata,
        },
      })
      .catch((restoreError) => {
        console.error(
          "[STORE_PAYMENT_RETRY_CLAIM_RESTORE]",
          restoreError,
        );
      });

    return NextResponse.json(
      {
        error:
          "تعذر إنشاء جلسة دفع جديدة حاليًا. لم يتم خصم مبلغ جديد ولم يتم تغيير الطلب.",
      },
      { status: 502 },
    );
  }

  /*
   * The old attempt is now superseded.
   * Its financial adjustments belong to the replacement attempt and must
   * NOT be restored by a delayed failed/expired callback from the old one.
   */
  await db.paymentTransaction.update({
    where: {
      id: latest.id,
    },
    data: {
      status: "expired",
      metadata: JSON.stringify({
        ...latestMetadata,
        storeRetryPreviousStatus:
          previousStatus,
        storeRetryClaimedAt:
          claimMetadata.storeRetryClaimedAt,
        storeRetrySupersededAt:
          new Date().toISOString(),
        storeRetrySupersededByPaymentTransactionId:
          replacement.id,
      }),
    },
  });

  return NextResponse.json({
    success: true,
    reused: false,
    paid: false,
    orderId: order.id,
    transactionId:
      replacement.id,
    checkoutUrl:
      replacement.checkoutUrl,
    expiresAt:
      replacement.expiresAt,
  });
}
