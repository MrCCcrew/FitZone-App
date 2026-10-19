import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}


// OFFER_BOX_FROZEN_SESSION_GUARD_V1
function hasFrozenOfferBoxAgeProof(raw: string): boolean {
  try {
    const snapshot: unknown = JSON.parse(raw);

    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot)
    ) return false;

    const age = (
      snapshot as Record<string, unknown>
    ).ageEligibility;

    if (
      !age ||
      typeof age !== "object" ||
      Array.isArray(age)
    ) return false;

    const proof = age as Record<string, unknown>;

    const method = proof.verificationMethod;

    if (
      method !== "egyptian_national_id" &&
      method !== "account_birth_date"
    ) return false;

    const validatedAt = proof.validatedAt;

    if (typeof validatedAt !== "string") return false;

    const validatedTime = Date.parse(validatedAt);

    if (
      !Number.isFinite(validatedTime) ||
      validatedTime > Date.now() + 60_000
    ) return false;

    const min = proof.minAgeYears;
    const max = proof.maxAgeYears;

    const validBound = (value: unknown) =>
      value === null ||
      (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 125
      );

    if (!validBound(min) || !validBound(max)) {
      return false;
    }

    if (
      typeof min === "number" &&
      typeof max === "number" &&
      min > max
    ) return false;

    const years = proof.ageYearsAtPurchase;

    const needsAge =
      method === "egyptian_national_id" ||
      proof.requiresBirthDate === true ||
      min !== null ||
      max !== null;

    if (!needsAge && years === null) return true;

    if (
      typeof years !== "number" ||
      !Number.isInteger(years) ||
      years < 0 ||
      years > 125
    ) return false;

    if (typeof min === "number" && years < min) {
      return false;
    }

    if (typeof max === "number" && years > max) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function GET(_: Request, context: { params: Promise<{ transactionId: string }> }) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
  }

  const { transactionId } = await context.params;
  const transaction = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      referenceCode: true,
      userId: true,
      provider: true,
      status: true,
      amount: true,
      currency: true,
      purpose: true,
      checkoutUrl: true,
      expiresAt: true,
      iframeUrl: true,
      providerPayload: true,
    },
  });

  if (!transaction || transaction.userId !== user.id) {
    return NextResponse.json({ error: "المعاملة غير موجودة." }, { status: 404 });
  }

  const payload = parseJson(transaction.providerPayload);
  if (transaction.provider !== "paymob" || !payload) {
    return NextResponse.json({ error: "جلسة الدفع غير متاحة لهذه المعاملة." }, { status: 400 });
  }

  if (transaction.status === "failed" || transaction.status === "cancelled") {
    return NextResponse.json(
      {
        error: "محاولة الدفع هذه غير صالحة. يرجى بدء محاولة دفع جديدة.",
        code: "PAYMENT_SESSION_NOT_PAYABLE",
      },
      { status: 409 },
    );
  }

  if (
    transaction.status === "expired" ||
    (transaction.status !== "paid" &&
      (!transaction.expiresAt ||
        !Number.isFinite(transaction.expiresAt.getTime()) ||
        transaction.expiresAt.getTime() <= Date.now()))
  ) {
    return NextResponse.json(
      {
        error: "انتهت صلاحية رابط الدفع. يرجى بدء محاولة دفع جديدة.",
        code: "PAYMENT_SESSION_EXPIRED",
      },
      { status: 410 },
    );
  }

  if (
    transaction.status !== "pending" &&
    transaction.status !== "requires_action" &&
    transaction.status !== "paid"
  ) {
    return NextResponse.json(
      {
        error: "جلسة الدفع غير متاحة لهذه الحالة.",
        code: "PAYMENT_SESSION_INVALID_STATUS",
      },
      { status: 409 },
    );
  }

  const isPaid = transaction.status === "paid";

  // Offer Box checkout is recoverable only against its
  // original purchase and frozen age authorization.
  // Never replace or mutate a Paymob transaction here.
  if (transaction.purpose === "offer_box" && !isPaid) {
    const purchase = await db.offerBoxPurchase.findUnique({
      where: {
        paymentTransactionId: transaction.id,
      },
      select: {
        id: true,
        userId: true,
        paymentTransactionId: true,
        status: true,
        holdExpiresAt: true,
        offerSnapshot: true,
      },
    });

    if (!purchase) {
      return NextResponse.json(
        {
          error: "تعذر التحقق من الشراء المرتبط بالدفع.",
          code: "OFFER_BOX_PAYMENT_PURCHASE_MISSING",
        },
        { status: 409 },
      );
    }

    if (
      purchase.userId !== user.id ||
      purchase.paymentTransactionId !== transaction.id
    ) {
      return NextResponse.json(
        { error: "عملية الشراء غير متاحة." },
        { status: 404 },
      );
    }

    if (purchase.status !== "pending_payment") {
      return NextResponse.json(
        {
          error: "عملية الشراء ليست في حالة انتظار الدفع.",
          code: "OFFER_BOX_PURCHASE_NOT_PENDING",
        },
        { status: 409 },
      );
    }

    if (
      !purchase.holdExpiresAt ||
      !Number.isFinite(purchase.holdExpiresAt.getTime()) ||
      purchase.holdExpiresAt.getTime() <= Date.now()
    ) {
      return NextResponse.json(
        {
          error: "انتهت صلاحية حجز هذا العرض.",
          code: "OFFER_BOX_HOLD_EXPIRED",
        },
        { status: 410 },
      );
    }

    if (!hasFrozenOfferBoxAgeProof(purchase.offerSnapshot)) {
      return NextResponse.json(
        {
          error:
            "لا يمكن استكمال الدفع قبل مراجعة أهلية هذا العرض. " +
            "لن يتم إنشاء عملية دفع جديدة.",
          code: "OFFER_BOX_AGE_PROOF_REQUIRED",
        },
        { status: 409 },
      );
    }
  }


  return NextResponse.json({
    transaction: {
      id: transaction.id,
      referenceCode: transaction.referenceCode,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      purpose: transaction.purpose,
      checkoutUrl: isPaid ? null : transaction.checkoutUrl,
      iframeUrl: isPaid ? null : transaction.iframeUrl,
    },
    session: {
      publicKey: isPaid ? null : payload.publicKey ?? null,
      clientSecret: isPaid ? null : payload.clientSecret ?? null,
      intentionId: isPaid ? null : payload.intentionId ?? null,
      checkoutUrl: isPaid ? null : (payload.checkoutUrl ?? transaction.checkoutUrl ?? null),
      iframeUrl: isPaid ? null : (payload.iframeUrl ?? transaction.iframeUrl ?? null),
      checkoutExperience: payload.checkoutExperience ?? null,
      enabledMethodLabels: Array.isArray(payload.enabledMethodLabels) ? payload.enabledMethodLabels : [],
      paymentMethods: Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [],
    },
  });
}
