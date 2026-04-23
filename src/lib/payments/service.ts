import { db } from "@/lib/db";
import { sendSubscriptionEmail } from "@/lib/email";
import { generateMembershipInvoicePdf, type MembershipInvoiceDetails } from "@/lib/membership-invoice";
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

function normalizeExternalPaymentMethod(method: string | null | undefined) {
  const raw = String(method ?? "").trim().toLowerCase();

  if (raw === "wallet" || raw === "free" || raw === "membership" || raw === "offer") {
    return raw;
  }

  return "paymob";
}

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

function toInvoiceDetails(value: Record<string, unknown> | null | undefined): MembershipInvoiceDetails | null {
  if (!value || typeof value !== "object") return null;
  const raw = value.membershipInvoice;
  if (!raw || typeof raw !== "object") return null;
  const invoice = raw as Record<string, unknown>;
  const endDateValue = invoice.endDate ? new Date(String(invoice.endDate)) : null;
  if (!endDateValue || Number.isNaN(endDateValue.getTime())) return null;
  const startDateValue = invoice.startDate ? new Date(String(invoice.startDate)) : null;
  const issuedAtValue = invoice.issuedAt ? new Date(String(invoice.issuedAt)) : undefined;
  return {
    invoiceNumber: String(invoice.invoiceNumber ?? ""),
    customerName: String(invoice.customerName ?? "FitZone Member"),
    customerEmail: String(invoice.customerEmail ?? ""),
    membershipName: String(invoice.membershipName ?? "Membership plan"),
    membershipNameEn: invoice.membershipNameEn ? String(invoice.membershipNameEn) : null,
    offerTitle: invoice.offerTitle ? String(invoice.offerTitle) : null,
    offerTitleEn: invoice.offerTitleEn ? String(invoice.offerTitleEn) : null,
    paymentMethod: String(invoice.paymentMethod ?? "membership"),
    originalPrice: Number(invoice.originalPrice ?? 0),
    membershipDiscount: Number(invoice.membershipDiscount ?? 0),
    discountCodeAmount: Number(invoice.discountCodeAmount ?? 0),
    discountCode: invoice.discountCode ? String(invoice.discountCode) : null,
    walletDeduct: Number(invoice.walletDeduct ?? 0),
    pointsDeduct: Number(invoice.pointsDeduct ?? 0),
    finalAmount: Number(invoice.finalAmount ?? 0),
    startDate: startDateValue && !Number.isNaN(startDateValue.getTime()) ? startDateValue : null,
    endDate: endDateValue,
    issuedAt: issuedAtValue && !Number.isNaN(issuedAtValue.getTime()) ? issuedAtValue : undefined,
  };
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
  const requestedProviderKey = String(input.provider ?? "").trim().toLowerCase();
  const requestedProvider = getPaymentProvider(requestedProviderKey);
  const provider =
    requestedProviderKey === "paymob" && requestedProvider?.enabled
      ? requestedProvider
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
      paymentMethod: normalizeExternalPaymentMethod(input.paymentMethod),
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
      paymentMethod: input.paymentMethod ?? null,
      customerPhone: input.customer?.phone ?? null,
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
    providerPayload: transaction.providerPayload,
  });

  // Store updated references regardless of status
  await db.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      providerReference: verification.providerReference ?? transaction.providerReference,
      externalReference: verification.externalReference ?? transaction.externalReference,
      providerPayload: stringifyJson(verification.payload ?? parseJson(transaction.providerPayload)),
    },
  });

  // If paid or failed, delegate to updatePaymentTransactionStatus which handles
  // membership activation, order confirmation, notifications, etc.
  if (verification.status === "paid" || verification.status === "failed") {
    return updatePaymentTransactionStatus(transactionId, verification.status, null);
  }

  const updated = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
  return mapPaymentTransaction(updated!, verification.message);
}

export async function updatePaymentTransactionStatus(
  transactionId: string,
  status: PaymentStatus,
  note?: string | null,
) {
  const existing = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: { status: true, metadata: true, membershipId: true, orderId: true, userId: true },
  });

  // Idempotency: if already in a terminal state, skip re-processing
  if (existing?.status === "paid" && status === "paid") {
    const current = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
    return mapPaymentTransaction(current!);
  }

  const transaction = await db.paymentTransaction.update({
    where: { id: transactionId },
    data: {
      status,
      metadata: stringifyJson({
        ...(parseJson(existing?.metadata) ?? {}),
        ...(note != null ? { adminNote: note } : {}),
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
        const now = new Date();
        const duration = membership.membership?.duration ?? 30;
        const endDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

        // updateMany with WHERE status=pending_payment makes this idempotent:
        // concurrent webhook calls won't double-activate.
        const activated = await db.userMembership.updateMany({
          where: { id: existing.membershipId, status: "pending_payment" },
          data: { status: "active", startDate: now, endDate },
        });
        if (activated.count === 0) {
          // Already activated by a concurrent webhook — skip side effects
          return mapPaymentTransaction(transaction);
        }

        // Unlock pending referral reward for the user who just subscribed
        if (existing.userId) {
          try {
            await unlockPendingReferralReward(existing.userId);
          } catch {}
        }

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
            const metadata = parseJson(transaction.metadata);
            const invoiceDetails = toInvoiceDetails(metadata);
            const normalizedInvoice = invoiceDetails
              ? {
                  ...invoiceDetails,
                  paymentMethod: transaction.paymentMethod,
                  startDate: now,
                  endDate,
                  issuedAt: transaction.paidAt ?? new Date(),
                  finalAmount: transaction.amount,
                }
              : null;
            const invoicePdf = normalizedInvoice ? await generateMembershipInvoicePdf(normalizedInvoice) : null;
            void sendSubscriptionEmail(
              userRecord.email,
              userRecord.name ?? "العضوة",
              membership.membership?.name ?? "الباقة",
              endDate,
              walletBonus > 0 ? walletBonus : undefined,
              scheduleRows,
              normalizedInvoice && invoicePdf
                ? {
                    details: normalizedInvoice,
                    filename: `fitzone-membership-invoice-${normalizedInvoice.invoiceNumber}.pdf`,
                    content: invoicePdf,
                  }
                : null,
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

    const metadata = parseJson(existing?.metadata);
    const privateSessionApplicationId =
      typeof metadata?.privateSessionApplicationId === "string"
        ? metadata.privateSessionApplicationId
        : null;

    if (privateSessionApplicationId) {
      await db.privateSessionApplication.updateMany({
        where: {
          id: privateSessionApplicationId,
          status: "approved",
        },
        data: {
          status: "paid",
          paymentTransactionId: transactionId,
          paidAt: transaction.paidAt ?? new Date(),
        },
      });
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

// Called after a subscription becomes active — rewards the referrer who brought this user
// if their previous pending referral had not yet been rewarded.
export async function unlockPendingReferralReward(subscribedUserId: string) {
  const usage = await db.referralUsage.findUnique({
    where: { referredUserId: subscribedUserId },
    include: { referral: { select: { id: true, userId: true } } },
  });

  if (!usage || usage.subscriptionActivated) return;

  // Mark this referred user as having subscribed
  await db.referralUsage.update({
    where: { id: usage.id },
    data: { subscriptionActivated: true, subscriptionActivatedAt: new Date() },
  });

  // Always increment the referrer's subscriptionActivatedCount
  await db.referral.update({
    where: { id: usage.referral.id },
    data: { subscriptionActivatedCount: { increment: 1 } },
  });

  // If the reward was not yet given at registration time, give it now
  if (!usage.rewardGiven) {
    const REWARD = 50;
    const referrerUserId = usage.referral.userId;

    const referrerWallet = await db.wallet.upsert({
      where: { userId: referrerUserId },
      update: {},
      create: { userId: referrerUserId, balance: 0 },
    });

    await db.wallet.update({
      where: { id: referrerWallet.id },
      data: { balance: { increment: REWARD } },
    });

    await db.walletTransaction.create({
      data: {
        walletId: referrerWallet.id,
        amount: REWARD,
        type: "credit",
        description: "مكافأة إحالة — اشترك العضو المُحال بنجاح",
      },
    });

    await db.referralUsage.update({
      where: { id: usage.id },
      data: { rewardGiven: true, rewardType: "wallet", rewardValue: REWARD },
    });

    await db.referral.update({
      where: { id: usage.referral.id },
      data: { totalEarned: { increment: REWARD } },
    });

    await db.notification.create({
      data: {
        userId: referrerUserId,
        title: "🎉 مكافأة إحالة!",
        body: `اشترك أحد أعضائك المُحالين بنجاح وحصلتِ على ${REWARD} ج.م في محفظتك!`,
        type: "success",
      },
    });
  }
}
