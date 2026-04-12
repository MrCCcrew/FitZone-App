import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { createPaymentTransaction } from "@/lib/payments/service";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const body = (await req.json()) as {
      membershipId?: string;
      offerId?: string;
      provider?: string;
      paymentMethod?: string;
      returnUrl?: string;
      cancelUrl?: string;
    };

    if (!body.membershipId && !body.offerId) {
      return NextResponse.json({ error: "يجب اختيار الباقة أو العرض أولًا." }, { status: 400 });
    }

    const userRecord = await db.user.findUnique({
      where: { id: currentUser.id },
      select: { emailVerified: true },
    });

    if (!userRecord?.emailVerified) {
      return NextResponse.json(
        { error: "يجب تفعيل الحساب أولًا قبل بدء دفع الاشتراك.", needsVerification: true },
        { status: 403 },
      );
    }

    let membershipId = body.membershipId ?? null;
    let offerId = body.offerId ?? null;
    let amount = 0;
    let description = "";

    if (offerId) {
      const offer = await db.offer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          title: true,
          type: true,
          isActive: true,
          expiresAt: true,
          membershipId: true,
          specialPrice: true,
          maxSubscribers: true,
          currentSubscribers: true,
        },
      });

      if (!offer || !offer.isActive || offer.expiresAt <= new Date()) {
        return NextResponse.json({ error: "العرض المحدد غير متاح الآن." }, { status: 400 });
      }

      if (offer.maxSubscribers != null && offer.currentSubscribers >= offer.maxSubscribers) {
        return NextResponse.json({ error: "اكتمل عدد المشتركات في هذا العرض." }, { status: 400 });
      }

      membershipId = offer.membershipId ?? null;
      amount = Number(offer.specialPrice ?? 0);
      description = `سداد اشتراك العرض الخاص ${offer.title}`;
    }

    if (membershipId && (!amount || amount <= 0)) {
      const membership = await db.membership.findUnique({
        where: { id: membershipId },
        select: { id: true, name: true, price: true, isActive: true },
      });

      if (!membership || !membership.isActive) {
        return NextResponse.json({ error: "الباقة المحددة غير متاحة." }, { status: 400 });
      }

      amount = membership.price;
      description = description || `سداد اشتراك باقة ${membership.name}`;
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "تعذر تحديد قيمة الاشتراك المطلوب." }, { status: 400 });
    }

    const transaction = await createPaymentTransaction({
      userId: currentUser.id,
      provider: body.provider ?? null,
      purpose: "membership",
      businessUnit: "club",
      amount,
      paymentMethod: body.paymentMethod ?? "card",
      membershipId,
      offerId,
      returnUrl: body.returnUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      description,
      metadata: {
        source: "membership-intent",
      },
      customer: {
        name: currentUser.name,
        email: currentUser.email,
        phone: null,
      },
    });

    return NextResponse.json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error("[PAYMENTS_MEMBERSHIP_INTENT_POST]", error);
    const message = error instanceof Error ? error.message : "تعذر إنشاء معاملة اشتراك جديدة.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
