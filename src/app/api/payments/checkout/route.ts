import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { createPaymentTransaction } from "@/lib/payments/service";

type CheckoutBody = {
  provider?: string;
  purpose?: "order" | "membership" | "wallet_topup";
  orderId?: string;
  membershipId?: string;
  offerId?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  returnUrl?: string;
  cancelUrl?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

function sanitizeProvider(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "paymob" ? "paymob" : "paymob";
}

function sanitizePaymentMethod(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "wallet" || raw === "free" || raw === "membership" || raw === "offer") return raw;
  return "paymob";
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const body = (await req.json()) as CheckoutBody;
    const purpose = body.purpose ?? "order";

    let resolvedAmount = Number(body.amount ?? 0);
    let resolvedMembershipId = body.membershipId ?? null;
    let resolvedOfferId = body.offerId ?? null;
    let description = body.description?.trim() || null;
    let orderId = body.orderId ?? null;

    if (purpose === "order") {
      if (!orderId) {
        return NextResponse.json({ error: "رقم الطلب مطلوب لبدء عملية الدفع." }, { status: 400 });
      }

      const order = await db.order.findFirst({
        where: { id: orderId, userId: user.id },
        select: { id: true, total: true, status: true },
      });

      if (!order) {
        return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
      }

      resolvedAmount = order.total;
      description = description ?? `دفع طلب رقم ${order.id}`;
    } else if (purpose === "membership") {
      if (!resolvedMembershipId && !resolvedOfferId) {
        return NextResponse.json({ error: "يجب اختيار الباقة أو العرض أولًا." }, { status: 400 });
      }

      if (resolvedOfferId) {
        const offer = await db.offer.findUnique({
          where: { id: resolvedOfferId },
          select: {
            title: true,
            isActive: true,
            expiresAt: true,
            membershipId: true,
            specialPrice: true,
          },
        });

        if (!offer || !offer.isActive || offer.expiresAt <= new Date()) {
          return NextResponse.json({ error: "العرض المحدد غير متاح الآن." }, { status: 400 });
        }

        resolvedMembershipId = offer.membershipId ?? null;
        resolvedAmount = Number(offer.specialPrice ?? 0);
        description = description ?? `سداد اشتراك العرض الخاص ${offer.title}`;
      }

      if (!resolvedAmount || resolvedAmount <= 0) {
        const membership = resolvedMembershipId
          ? await db.membership.findUnique({
              where: { id: resolvedMembershipId },
              select: { name: true, price: true, isActive: true },
            })
          : null;

        if (!membership || !membership.isActive) {
          return NextResponse.json({ error: "الباقة المحددة غير متاحة." }, { status: 400 });
        }

        resolvedAmount = membership.price;
        description = description ?? `سداد اشتراك باقة ${membership.name}`;
      }
    } else if (purpose === "wallet_topup") {
      if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
        return NextResponse.json({ error: "قيمة شحن المحفظة غير صحيحة." }, { status: 400 });
      }

      description = description ?? "شحن رصيد المحفظة";
    }

    const normalizedPaymentMethod = sanitizePaymentMethod(body.paymentMethod);
    let customerPhone: string | null = null;
    if (normalizedPaymentMethod === "wallet") {
      const userRecord = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
      customerPhone = userRecord?.phone ?? null;
    }

    const result = await createPaymentTransaction({
      userId: user.id,
      provider: sanitizeProvider(body.provider),
      purpose,
      businessUnit: purpose === "order" ? "store" : "club",
      amount: resolvedAmount,
      currency: body.currency ?? "EGP",
      paymentMethod: normalizedPaymentMethod,
      orderId,
      membershipId: resolvedMembershipId,
      offerId: resolvedOfferId,
      returnUrl: body.returnUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      description,
      metadata: body.metadata ?? null,
      customer: {
        name: user.name,
        email: user.email,
        phone: customerPhone,
      },
    });

    return NextResponse.json({
      success: true,
      transaction: result,
    });
  } catch (error) {
    console.error("[PAYMENTS_CHECKOUT_POST]", error);
    const message = error instanceof Error ? error.message : "تعذر إنشاء معاملة الدفع.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
