import { db } from "@/lib/db";
import { sendSubscriptionEmail } from "@/lib/email";
import { getDefaultPaymentProvider, getPaymentProvider, listPaymentProviders } from "@/lib/payments/registry";
import type {
  PaymentProviderKey,
  PaymentPurpose,
  PaymentStatus,
} from "@/lib/payments/types";

type CreatePaymentTransactionInput = {
  userId: string;
  provider?: string | null;
  purpose: PaymentPurpose;
  businessUnit?: "store" | "club";
  amount: number;
  currency?: string | null;
  paymentMethod?: string | null;
  orderId?: string | null;
  membershipId?: string | null;
  offerId?: string | null;
  returnUrl?: string | null;
  cancelUrl?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
};

function stringifyJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return null;
  return JSON.stringify(value);
}

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getDefaultBusinessUnit(purpose: PaymentPurpose) {
  if (purpose === "order") return "store";
  return "club";
}

export function getAvailablePaymentProviders() {
  return listPaymentProviders().map((provider) => ({
    key: provider.key,
    label: provider.label,
    enabled: provider.enabled,
    supportsCards: provider.supportsCards,
  }));
}

export async function createPaymentTransaction(input: CreatePaymentTransactionInput) {
  const provider =
    getPaymentProvider(input.provider) && getPaymentProvider(input.provider)?.enabled
      ? getPaymentProvider(input.provider)!
      : getDefaultPaymentProvider();

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("قيمة الدفع غير صحيحة.");
  }

  const transaction = await db.paymentTransaction.create({
    data: {
      userId: input.userId,
      orderId: input.orderId ?? null,
      membershipId: input.membershipId ?? null,
      offerId: input.offerId ?? null,
      purpose: input.purpose,
      businessUnit: input.businessUnit ?? getDefaultBusinessUnit(input.purpose),
      provider: provider.key,
      amount,
      currency: (input.currency || "EGP").toUpperCase(),
      paymentMethod: input.paymentMethod ?? "card",
      returnUrl: input.returnUrl ?? null,
      cancelUrl: input.cancelUrl ?? null,
      metadata: stringifyJson({
        description: input.description ?? null,
        ...(input.metadata ?? {}),
      }),
    },
  });

  const checkout = await provider.createCheckout({
    transactionId: transaction.id,
    amount: transaction.amount,
    currency: transaction.currency,
    purpose: input.purpose,
    returnUrl: input.returnUrl ?? null,
    cancelUrl: input.cancelUrl ?? null,
    customer: {
      id: input.userId,
      name: input.customer?.name ?? null,
      email: input.customer?.email ?? null,
      phone: input.customer?.phone ?? null,
    },
    context: {
      orderId: input.orderId ?? null,
      membershipId: input.membershipId ?? null,
      offerId: input.offerId ?? null,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
    },
  });

  const updated = await db.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: checkout.status,
      checkoutUrl: checkout.checkoutUrl ?? null,
      iframeUrl: checkout.iframeUrl ?? null,
      providerReference: checkout.providerReference ?? null,
      externalReference: checkout.externalReference ?? null,
      providerPayload: stringifyJson(checkout.payload ?? null),
      expiresAt: checkout.expiresAt ?? null,
    },
  });

  return mapPaymentTransaction(updated, checkout.message);
}

export async function verifyPaymentTransaction(transactionId: string) {
  const transaction = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    throw new Error("معاملة الدفع غير موجودة.");
  }

  const provider = getPaymentProvider(transaction.provider) ?? getDefaultPaymentProvider();
  const verification = await provider.verifyTransaction({
    id: transaction.id,
    providerReference: transaction.providerReference,
    externalReference: transaction.externalReference,
    amount: transaction.amount,
    currency: transaction.currency,
    metadata: transaction.metadata,
  });

  const updated = await db.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: verification.status,
      providerReference: verification.providerReference ?? transaction.providerReference,
      externalReference: verification.externalReference ?? transaction.externalReference,
      providerPayload: stringifyJson(verification.payload ?? parseJson(transaction.providerPayload)),
      paidAt: verification.status === "paid" ? new Date() : transaction.paidAt,
      failedAt: verification.status === "failed" ? new Date() : transaction.failedAt,
    },
  });

  return mapPaymentTransaction(updated, verification.message);
}

export async function updatePaymentTransactionStatus(
  transactionId: string,
  status: PaymentStatus,
  note?: string | null,
) {
  const existing = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: { metadata: true, membershipId: true, orderId: true, userId: true },
  });

  const transaction = await db.paymentTransaction.update({
    where: { id: transactionId },
    data: {
      status,
      metadata: stringifyJson({
        ...(parseJson(existing?.metadata) ?? {}),
        adminNote: note ?? null,
      }),
      paidAt: status === "paid" ? new Date() : undefined,
      failedAt: status === "failed" ? new Date() : undefined,
    },
  });

  // Activate linked membership or order when payment confirmed
  if (status === "paid") {
    if (existing?.membershipId) {
      const membership = await db.userMembership.findUnique({
        where: { id: existing.membershipId },
        select: {
          status: true,
          offerId: true,
          membership: {
            select: {
              name: true,
              duration: true,
              walletBonus: true,
              productRewards: true,
            },
          },
        },
      });
      if (membership?.status === "pending_payment") {
        // Set startDate/endDate from now (payment just confirmed)
        const now = new Date();
        const duration = membership.membership?.duration ?? 30;
        const endDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

        await db.userMembership.update({
          where: { id: existing.membershipId },
          data: { status: "active", startDate: now, endDate },
        });

        // Give wallet bonus
        const walletBonus = membership.membership?.walletBonus ?? 0;
        if (walletBonus > 0 && existing.userId) {
          const wallet = await db.wallet.upsert({
            where: { userId: existing.userId },
            update: { balance: { increment: walletBonus } },
            create: { userId: existing.userId, balance: walletBonus },
          });
          await db.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: walletBonus,
              type: "credit",
              description: `مكافأة الاشتراك في باقة ${membership.membership?.name ?? ""}`,
            },
          });
        }

        // Deduct product rewards from inventory
        const productRewardsRaw = membership.membership?.productRewards ?? null;
        if (productRewardsRaw) {
          try {
            const productRewards = JSON.parse(productRewardsRaw) as { productId: string; quantity: number }[];
            for (const reward of productRewards) {
              if (!reward?.productId || !reward?.quantity) continue;
              const product = await db.product.findUnique({ where: { id: reward.productId } });
              if (!product) continue;
              if (product.trackInventory) {
                await db.product.update({
                  where: { id: reward.productId },
                  data: { stock: { decrement: reward.quantity } },
                });
              }
              await db.inventoryMovement.create({
                data: {
                  productId: product.id,
                  type: "package_consumption",
                  quantityChange: -Math.abs(reward.quantity),
                  quantityBefore: product.stock,
                  quantityAfter: product.trackInventory ? product.stock - reward.quantity : product.stock,
                  unitCost: product.averageCost,
                  averageCostBefore: product.averageCost,
                  averageCostAfter: product.averageCost,
                  referenceType: "membership",
                  referenceId: existing.membershipId,
                  notes: `Package activation: ${membership.membership?.name ?? ""}`,
                },
              });
            }
          } catch {}
        }

        // Increment offer subscribers
        if (membership.offerId) {
          await db.offer.update({
            where: { id: membership.offerId },
            data: { currentSubscribers: { increment: 1 } },
          });
        }

        if (existing.userId) {
          await db.notification.create({
            data: {
              userId: existing.userId,
              title: `تم تفعيل اشتراكك في ${membership.membership?.name ?? "الباقة"}!`,
              body: "تم استلام دفعتك وتفعيل اشتراكك بنجاح.",
              type: "success",
            },
          });

          // Send confirmation email with booked schedule after payment verified
          const userRecord = await db.user.findUnique({
            where: { id: existing.userId },
            select: { email: true, name: true },
          });
          if (userRecord?.email) {
            const bookedSchedules = await db.booking.findMany({
              where: { userMembershipId: existing.membershipId, status: "confirmed" },
              include: { schedule: { include: { class: { include: { trainer: true } } } } },
            });
            const scheduleRows = bookedSchedules.map((b) => ({
              date: b.schedule.date,
              time: b.schedule.time,
              className: b.schedule.class.name,
              trainerName: b.schedule.class.trainer.name,
            }));
            void sendSubscriptionEmail(
              userRecord.email,
              userRecord.name ?? "العضوة",
              membership.membership?.name ?? "الباقة",
              endDate,
              walletBonus > 0 ? walletBonus : undefined,
              scheduleRows,
            ).catch((err) => console.error("[PAYMENT_EMAIL]", err));
          }
        }
      }
    }

    if (existing?.orderId) {
      const order = await db.order.findUnique({
        where: { id: existing.orderId },
        select: { status: true },
      });
      if (order?.status === "pending") {
        await db.order.update({
          where: { id: existing.orderId },
          data: { status: "confirmed" },
        });
      }
    }
  }

  return mapPaymentTransaction(transaction);
}

export async function listRecentPaymentTransactions(limit = 50) {
  const rows = await db.paymentTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      user: { select: { name: true, email: true, phone: true } },
      order: { select: { total: true, status: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    customerName: row.user?.name ?? "عميل",
    customerEmail: row.user?.email ?? null,
    customerPhone: row.user?.phone ?? null,
    provider: row.provider,
    purpose: row.purpose,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    paymentMethod: row.paymentMethod,
    orderId: row.orderId,
    membershipId: row.membershipId,
    offerId: row.offerId,
    checkoutUrl: row.checkoutUrl,
    iframeUrl: row.iframeUrl,
    providerReference: row.providerReference,
    externalReference: row.externalReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata: parseJson(row.metadata),
  }));
}

function mapPaymentTransaction(
  transaction: {
    id: string;
    provider: string;
    purpose: string;
    amount: number;
    currency: string;
    status: string;
    paymentMethod: string;
    orderId: string | null;
    membershipId: string | null;
    offerId: string | null;
    checkoutUrl: string | null;
    iframeUrl: string | null;
    providerReference: string | null;
    externalReference: string | null;
    returnUrl: string | null;
    cancelUrl: string | null;
    providerPayload: string | null;
    metadata: string | null;
    expiresAt: Date | null;
    paidAt?: Date | null;
    failedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  message?: string,
) {
  return {
    id: transaction.id,
    provider: transaction.provider as PaymentProviderKey,
    purpose: transaction.purpose as PaymentPurpose,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status as PaymentStatus,
    paymentMethod: transaction.paymentMethod,
    orderId: transaction.orderId,
    membershipId: transaction.membershipId,
    offerId: transaction.offerId,
    checkoutUrl: transaction.checkoutUrl,
    iframeUrl: transaction.iframeUrl,
    providerReference: transaction.providerReference,
    externalReference: transaction.externalReference,
    returnUrl: transaction.returnUrl,
    cancelUrl: transaction.cancelUrl,
    payload: parseJson(transaction.providerPayload),
    metadata: parseJson(transaction.metadata),
    expiresAt: transaction.expiresAt,
    paidAt: transaction.paidAt ?? null,
    failedAt: transaction.failedAt ?? null,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    message: message ?? null,
  };
}
