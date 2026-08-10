import { db } from "@/lib/db";
import { buildAttendancePayload, ensureMembershipAttendancePass, ensurePrivateAttendancePass } from "@/lib/attendance";
import { sendSubscriptionEmail, sendAdminSubscriptionNotification, sendStoreOrderEmail, sendAdminOrderNotification } from "@/lib/email";
import { generateStoreOrderInvoicePdf } from "@/lib/store-order-invoice";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";
import { generateMembershipQrCard } from "@/lib/membership-card";
import { generateMembershipInvoicePdf, type MembershipInvoiceDetails } from "@/lib/membership-invoice";
import { recordPaymentStatusEvent } from "@/lib/analytics/payment-events";
import { recordMembershipActivatedEvent } from "@/lib/analytics/membership-events";
import { getDefaultPaymentProvider, getPaymentProvider, listPaymentProviders } from "@/lib/payments/registry";
import { runPaidMembershipPostActivationReconciliation } from "@/lib/payments/reconciliation-helper";
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

type PaymentReferenceCategory =
  | "shop"
  | "subscription"
  | "trial"
  | "offers"
  | "package"
  | "private"
  | "wallet";

const PAYMENT_REFERENCE_PREFIXES: Record<PaymentReferenceCategory, string> = {
  shop: "FZ-Shop",
  subscription: "FZ-Sub",
  trial: "FZ-Trial",
  offers: "FZ-Offers",
  package: "FZ-Packg",
  private: "FZ-Pri",
  wallet: "FZ-Wallet",
};

type PaymentReferenceDbClient = Pick<typeof db, "userMembership" | "paymentReferenceCounter">;

type WalletTopupTestFailpoint = "credit" | "ledger" | null;
let walletTopupTestFailpoint: WalletTopupTestFailpoint = null;

/** Test-only hook used by real transaction tests to prove rollback behavior. */
export function setWalletTopupTestFailpoint(failpoint: WalletTopupTestFailpoint) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Wallet top-up failpoints are available only in tests.");
  }
  walletTopupTestFailpoint = failpoint;
}

function triggerWalletTopupTestFailpoint(stage: Exclude<WalletTopupTestFailpoint, null>) {
  if (process.env.NODE_ENV === "test" && walletTopupTestFailpoint === stage) {
    throw new Error(`WALLET_TOPUP_TEST_FAILPOINT:${stage}`);
  }
}

function normalizeExternalPaymentMethod(method: string | null | undefined) {
  const raw = String(method ?? "").trim().toLowerCase();

  if (raw === "wallet" || raw === "free" || raw === "membership" || raw === "offer" || raw === "cod" || raw === "cash_on_delivery") {
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

/**
 * Shared activation helper for both normal payment and recovery flows.
 * Atomically claims payment and activates membership in ONE transaction.
 *
 * CRITICAL: Both normal webhook and verified recovery MUST use this helper
 * to ensure identical activation business logic (duration calculation,
 * late payment handling, race protection, etc.)
 */
async function activatePaidMembershipTx(
  tx: any,
  transactionId: string,
  membershipId: string
): Promise<{
  success: boolean;
  membershipData: {
    status: string;
    startDate: Date;
    offerId: string | null;
    membership: {
      name: string;
      nameEn: string | null;
      duration: number;
      walletBonus: number;
      productRewards: string | null;
    };
    offer: { title: string } | null;
  } | null;
}> {
  const membership = await tx.userMembership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      status: true,
      pendingExpiresAt: true,
      offerId: true,
      snapshotDurationDays: true,
      membership: {
        select: {
          name: true,
          nameEn: true,
          duration: true,
          walletBonus: true,
          productRewards: true,
        },
      },
      offer: {
        select: { title: true },
      },
    },
  });

  if (!membership) {
    console.warn(`[ACTIVATION] Membership ${membershipId} not found (deleted by cron?)`);
    return { success: false, membershipData: null };
  }

  // Late payment check: if cancelled by cron after timeout
  if (membership.status === "cancelled") {
    console.warn(
      `[ACTIVATION] Late payment for membership ${membershipId}. ` +
      `Cron already cancelled it. Booking spots may have been reassigned. Manual review required.`
    );
    // Record in transaction metadata for admin review/refund
    const existing = await tx.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { metadata: true },
    });
    await tx.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        metadata: stringifyJson({
          ...(parseJson(existing?.metadata) ?? {}),
          latePaymentWarning: true,
          membershipStatus: "cancelled",
          paymentReceivedAt: new Date().toISOString(),
        }),
      },
    });
    return { success: false, membershipData: null };
  }

  // Already active - return existing state
  if (membership.status === "active") {
    const duration = membership.snapshotDurationDays ?? membership.membership?.duration ?? 30;
    return {
      success: true,
      membershipData: {
        status: membership.status,
        startDate: new Date(), // Will be overwritten by actual startDate if available
        offerId: membership.offerId,
        membership: { ...membership.membership, duration },
        offer: membership.offer,
      },
    };
  }

  if (membership.status === "pending_payment") {
    const now = new Date();
    // Pending offer memberships carry their purchase-time duration. A
    // later edit to the offer or linked plan cannot alter this activation.
    const duration = membership.snapshotDurationDays ?? membership.membership?.duration ?? 30;
    const endDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    // Atomic activation: race vs cron cleanup
    const activated = await tx.userMembership.updateMany({
      where: { id: membershipId, status: "pending_payment" },
      data: {
        status: "active",
        startDate: now,
        endDate,
        pendingExpiresAt: null, // Clear timeout on successful activation
      },
    });

    if (activated.count === 0) {
      console.warn(`[ACTIVATION] Membership ${membershipId} already processed (cron won race)`);
      return { success: false, membershipData: null };
    }

    console.log(`[ACTIVATION] Successfully activated membership ${membershipId}`);
    return {
      success: true,
      membershipData: {
        status: "active",
        startDate: now,
        offerId: membership.offerId,
        membership: { ...membership.membership, duration },
        offer: membership.offer,
      },
    };
  }

  // Invalid status for activation
  return { success: false, membershipData: null };
}

function extractPaymentAdjustments(metadata: Record<string, unknown> | null | undefined) {
  const adjustmentRecord =
    metadata?.paymentAdjustments && typeof metadata.paymentAdjustments === "object"
      ? (metadata.paymentAdjustments as Record<string, unknown>)
      : null;
  const invoiceRecord =
    metadata?.membershipInvoice && typeof metadata.membershipInvoice === "object"
      ? (metadata.membershipInvoice as Record<string, unknown>)
      : null;

  const walletAmount = Number(
    adjustmentRecord?.walletAmount ??
      metadata?.walletDeductedAmount ??
      metadata?.walletDeducted ??
      invoiceRecord?.walletDeduct ??
      0,
  );

  const pointsCount = Number(
    adjustmentRecord?.pointsCount ??
      metadata?.pointsDeductedCount ??
      metadata?.pointsDeducted ??
      0,
  );

  const restoredAt = typeof adjustmentRecord?.restoredAt === "string" ? adjustmentRecord.restoredAt : null;

  return {
    walletAmount: Number.isFinite(walletAmount) ? Math.max(0, walletAmount) : 0,
    pointsCount: Number.isFinite(pointsCount) ? Math.max(0, Math.floor(pointsCount)) : 0,
    restoredAt,
  };
}

export async function restorePaymentBalanceAdjustments(input: {
  userId: string;
  walletAmount?: number | null;
  pointsCount?: number | null;
  reference?: string | null;
}) {
  const walletAmount = Math.max(0, Number(input.walletAmount ?? 0));
  const pointsCount = Math.max(0, Math.floor(Number(input.pointsCount ?? 0)));

  if (walletAmount <= 0 && pointsCount <= 0) return;

  await db.$transaction(async (tx) => {
    if (walletAmount > 0) {
      const wallet = await tx.wallet.upsert({
        where: { userId: input.userId },
        update: { balance: { increment: walletAmount } },
        create: { userId: input.userId, balance: walletAmount },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: walletAmount,
          type: "credit",
          description: `استرجاع رصيد محفظة لعملية غير مكتملة ${input.reference ?? ""}`.trim(),
        },
      });
    }

    if (pointsCount > 0) {
      const rewardPoints = await tx.rewardPoints.upsert({
        where: { userId: input.userId },
        update: { points: { increment: pointsCount } },
        create: { userId: input.userId, points: pointsCount, tier: "bronze" },
      });

      await tx.rewardHistory.create({
        data: {
          rewardId: rewardPoints.id,
          points: pointsCount,
          reason: `استرجاع فيتزونات ولاء لعملية غير مكتملة ${input.reference ?? ""}`.trim(),
        },
      });
    }
  });
}

async function restorePaymentTransactionAdjustments(transactionId: string) {
  await db.$transaction(async (tx) => {
    const transaction = await tx.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        referenceCode: true,
        userId: true,
        status: true,
        metadata: true,
      },
    });

    if (!transaction || transaction.status === "paid") return;

    const metadata = parseJson(transaction.metadata);
    const adjustments = extractPaymentAdjustments(metadata);
    if (adjustments.restoredAt || (adjustments.walletAmount <= 0 && adjustments.pointsCount <= 0)) return;

    if (adjustments.walletAmount > 0) {
      const wallet = await tx.wallet.upsert({
        where: { userId: transaction.userId },
        update: { balance: { increment: adjustments.walletAmount } },
        create: { userId: transaction.userId, balance: adjustments.walletAmount },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: adjustments.walletAmount,
          type: "credit",
          description: `استرجاع رصيد محفظة للمعاملة ${transaction.referenceCode ?? transaction.id}`,
        },
      });
    }

    if (adjustments.pointsCount > 0) {
      const rewardPoints = await tx.rewardPoints.upsert({
        where: { userId: transaction.userId },
        update: { points: { increment: adjustments.pointsCount } },
        create: { userId: transaction.userId, points: adjustments.pointsCount, tier: "bronze" },
      });

      await tx.rewardHistory.create({
        data: {
          rewardId: rewardPoints.id,
          points: adjustments.pointsCount,
          reason: `استرجاع فيتزونات ولاء للمعاملة ${transaction.referenceCode ?? transaction.id}`,
        },
      });
    }

    await tx.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        metadata: stringifyJson({
          ...(metadata ?? {}),
          paymentAdjustments: {
            ...(((metadata?.paymentAdjustments as Record<string, unknown> | undefined) ?? {})),
            walletAmount: adjustments.walletAmount,
            pointsCount: adjustments.pointsCount,
            restoredAt: new Date().toISOString(),
          },
        }),
      },
    });
  });
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

async function resolvePaymentReferenceCategory(
  tx: PaymentReferenceDbClient,
  input: CreatePaymentTransactionInput,
): Promise<PaymentReferenceCategory> {
  if (input.purpose === "order") return "shop";
  if (input.purpose === "wallet_topup") return "wallet";
  if (input.purpose === "private_session") return "private";

  if (input.offerId) return "offers";

  if (input.membershipId) {
    const membership = await tx.userMembership.findUnique({
      where: { id: input.membershipId },
      select: {
        offerId: true,
        membership: {
          select: {
            kind: true,
          },
        },
      },
    });

    if (membership?.offerId) return "offers";

    const membershipKind = String(membership?.membership?.kind ?? "").trim().toLowerCase();
    if (membershipKind === "trial") return "trial";
    if (membershipKind === "package") return "package";
  }

  const metadataKind = String(
    input.metadata?.membershipKind ?? input.metadata?.membershipType ?? "",
  )
    .trim()
    .toLowerCase();

  if (metadataKind === "trial") return "trial";
  if (metadataKind === "package") return "package";

  return "subscription";
}

async function generatePaymentReferenceCode(
  tx: PaymentReferenceDbClient,
  category: PaymentReferenceCategory,
) {
  const counter = await tx.paymentReferenceCounter.upsert({
    where: { key: category },
    update: { value: { increment: 1 } },
    create: { key: category, value: 1 },
    select: { value: true },
  });

  return `${PAYMENT_REFERENCE_PREFIXES[category]}-${String(counter.value).padStart(7, "0")}`;
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

  const transaction = await db.$transaction(async (tx) => {
    const referenceCategory = await resolvePaymentReferenceCategory(tx, input);
    const referenceCode = await generatePaymentReferenceCode(tx, referenceCategory);

    return tx.paymentTransaction.create({
      data: {
        userId: input.userId,
        orderId: input.orderId ?? null,
        membershipId: input.membershipId ?? null,
        offerId: input.offerId ?? null,
        referenceCode,
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
  if (
    verification.status === "paid" ||
    verification.status === "failed" ||
    verification.status === "cancelled" ||
    verification.status === "expired"
  ) {
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
    select: { status: true, metadata: true, membershipId: true, orderId: true, userId: true, purpose: true },
  });

  // Idempotency: if already in a terminal state, skip re-processing
  if (existing?.status === "paid" && status === "paid") {
    const current = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
    return mapPaymentTransaction(current!);
  }

  if (status === "paid" && existing?.purpose === "wallet_topup") {
    await db.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({
        where: { id: transactionId },
        select: { id: true, userId: true, amount: true, currency: true, status: true, purpose: true, referenceCode: true },
      });
      if (!payment) throw new Error("معاملة الدفع غير موجودة.");
      if (payment.purpose !== "wallet_topup" || payment.currency.toUpperCase() !== "EGP") {
        throw new Error("معاملة شحن المحفظة غير صالحة.");
      }

      const claimed = await tx.paymentTransaction.updateMany({
        where: { id: payment.id, status: { in: ["pending", "pending_payment", "processing", "requires_action"] } },
        data: { status: "paid", paidAt: new Date() },
      });
      if (claimed.count === 0) return null;

      triggerWalletTopupTestFailpoint("credit");
      const wallet = await tx.wallet.upsert({
        where: { userId: payment.userId },
        update: { balance: { increment: payment.amount } },
        create: { userId: payment.userId, balance: payment.amount },
      });
      triggerWalletTopupTestFailpoint("ledger");
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: payment.amount,
          type: "credit",
          description: `شحن محفظة عبر ${payment.referenceCode ?? payment.id}`,
        },
      });
      return payment.id;
    });

    const current = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!current) throw new Error("معاملة الدفع غير موجودة.");
    return mapPaymentTransaction(current);
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

  // Claim a successful payment transition before any side effect. This makes
  // duplicate provider webhooks harmless, including wallet credits.
  if (status === "paid" && existing?.status !== "paid") {
    const claimed = await db.paymentTransaction.updateMany({
      where: { id: transactionId, status: { in: ["pending", "pending_payment", "processing", "requires_action"] } },
      data: { status: "paid", paidAt: new Date() },
    });
    if (claimed.count === 0) {
      const current = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
      if (!current) throw new Error("معاملة الدفع غير موجودة.");
      return mapPaymentTransaction(current);
    }
  }

  const previousStatus = existing?.status;
  const wasOpen = previousStatus === "pending" || previousStatus === "processing" || previousStatus === "requires_action";
  if (wasOpen && (status === "paid" || status === "failed" || status === "cancelled" || status === "expired")) {
    void recordPaymentStatusEvent(transactionId, status).catch(() => null);
  }

  if (status === "failed" || status === "cancelled" || status === "expired") {
    await restorePaymentTransactionAdjustments(transactionId);

    // Cancel any confirmed bookings that were pre-created for this membership and restore spots
    const failedMembershipId = existing?.membershipId;
    if (failedMembershipId) {
      await db.userMembership.updateMany({
        where: { id: failedMembershipId, status: "pending_payment" },
        data: { status: "expired" },
      });
      const pendingBookings = await db.booking.findMany({
        where: { userMembershipId: failedMembershipId, status: "confirmed" },
        select: { id: true, scheduleId: true },
      });
      if (pendingBookings.length > 0) {
        await db.booking.updateMany({
          where: { id: { in: pendingBookings.map((b) => b.id) } },
          data: { status: "cancelled" },
        });
        const uniqueScheduleIds = [...new Set(pendingBookings.map((b) => b.scheduleId))];
        await Promise.all(
          uniqueScheduleIds.map((id) =>
            db.schedule.update({
              where: { id },
              data: { availableSpots: { increment: 1 } },
            }),
          ),
        );
      }
    }

    // Phase 2C: Release reservation for failed orders
    const failedOrderId = existing?.orderId;
    if (failedOrderId) {
      const { releaseOrderReservation } = await import("@/lib/inventory-service");

      await db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: failedOrderId },
          select: {
            id: true,
            status: true,
            inventoryDeducted: true,
            items: {
              select: {
                productId: true,
                quantity: true,
              },
            },
          },
        });

        // Only release if still pending and reservation exists (inventoryDeducted=false in Phase 2C)
        if (!order || order.status !== "pending") {
          return; // Already processed
        }

        // Double-check: no paid payment (race guard)
        const paidPayment = await tx.paymentTransaction.findFirst({
          where: { orderId: failedOrderId, status: "paid" },
        });

        if (paidPayment) {
          // Payment confirmed during this transaction - abort
          throw new Error("PAYMENT_CONFIRMED_RACE");
        }

        // Release reservation (reservedStock -= quantity, stock unchanged)
        await releaseOrderReservation(
          tx,
          order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          failedOrderId
        );

        // Cancel order
        await tx.order.update({
          where: { id: failedOrderId },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
          },
        });
      }, { timeout: 10000 });
    }

    const restored = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
    return mapPaymentTransaction(restored!);
  }

  // Activate linked membership or order when payment confirmed
  if (status === "paid") {
    if (existing?.membershipId) {
      // ── Activate membership with race condition protection ────────────────
      const membershipId = existing.membershipId; // TypeScript narrowing
      let activationSucceeded = false;
      let membershipData: {
        status: string;
        startDate: Date;
        offerId: string | null;
        membership: { name: string; nameEn: string | null; duration: number; walletBonus: number; productRewards: string | null };
        offer: { title: string } | null;
      } | null = null;

      await db.$transaction(async (tx) => {
        const result = await activatePaidMembershipTx(tx, transactionId, membershipId);
        activationSucceeded = result.success;
        membershipData = result.membershipData;
      });

      if (!activationSucceeded || !membershipData) {
        // Webhook lost race or membership already processed
        return mapPaymentTransaction(transaction);
      }
      void recordMembershipActivatedEvent(existing.membershipId, transactionId).catch(() => null);


      // Execute post-activation reconciliation with row-lock exact-once guarantee
      await runPaidMembershipPostActivationReconciliation({
        transactionId,
        userId: existing.userId,
        userMembershipId: existing.membershipId,
        membershipData,
        paymentAmount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        paidAt: transaction.paidAt,
        transactionMetadata: transaction.metadata,
      });
    }

    if (existing?.orderId) {
      // Phase 2C: Convert reservation to sale atomically
      const { confirmOrderInventorySale, updateOrderItemCostPrices } = await import("@/lib/inventory-service");

      const order = await db.order.findUnique({
        where: { id: existing.orderId },
        select: {
          status: true, subtotal: true, shippingFee: true, discountTotal: true, total: true,
          paymentMethod: true, address: true, deliveryLabel: true, isClubPickup: true,
          inventoryDeducted: true,
          items: { include: { product: { select: { name: true } } } },
        },
      });

      if (order?.status === "pending" && !order.inventoryDeducted) {
        // Phase 2C: Convert reservation → sale
        await db.$transaction(async (tx) => {
          // Atomic claim: only process if still pending
          const claimed = await tx.order.updateMany({
            where: { id: existing.orderId!, status: "pending" },
            data: {
              status: "confirmed",
              inventoryDeducted: true,
              confirmedAt: new Date(), // Immutable: set once at sale completion
            },
          });

          if (claimed.count === 0) {
            return; // Already processed by another webhook
          }

          // Convert reservation to sale (stock -= qty, reservedStock -= qty, capture COGS)
          const saleResults = await confirmOrderInventorySale(
            tx,
            order.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            existing.orderId!
          );

          // Capture cost prices in order items
          await updateOrderItemCostPrices(tx, existing.orderId!, saleResults);

          // Phase 4: Post GL journal for sale
          try {
            const { postSaleJournal } = await import("@/lib/accounting-service");
            await postSaleJournal(
              tx,
              existing.orderId!,
              order.total,
              saleResults.map((r) => ({
                productId: r.productId,
                quantity: order.items.find((i) => i.productId === r.productId)?.quantity ?? 0,
                costPrice: r.costPrice,
              })),
              order.paymentMethod // Pass payment method for account determination
            );
          } catch (err) {
            console.error("[GL_SALE_JOURNAL]", err);
            // Don't block order confirmation if GL fails
          }
        }, { timeout: 15000 });
      } else if (order?.status === "pending" && order.inventoryDeducted) {
        // Already converted (idempotent webhook retry)
        await db.order.update({
          where: { id: existing.orderId },
          data: { status: "confirmed" },
        });
      }

      // Unlock pending referral reward for Paymob-confirmed store orders
      if (order && existing.userId) {
        try {
          await unlockPendingReferralReward(existing.userId);
        } catch {}
      }

      // Send order emails (fire-and-forget)
      if (order && existing.userId) {
        void (async () => {
          try {
            const userRecord = await db.user.findUnique({
              where: { id: existing.userId! },
              select: { email: true, name: true },
            });
            if (!userRecord?.email) return;
            const invoiceNumber = `ORD-${existing.orderId!.slice(-8).toUpperCase()}`;
            const orderItems = order.items.map((oi) => ({
              name: oi.product.name,
              quantity: oi.quantity,
              unitPrice: oi.price,
              size: oi.size ?? null,
            }));
            const invoiceDetails = {
              invoiceNumber,
              customerName: userRecord.name ?? "عميل",
              customerEmail: userRecord.email,
              paymentMethod: transaction.paymentMethod ?? order.paymentMethod ?? "paymob",
              issuedAt: transaction.paidAt ?? new Date(),
              items: orderItems,
              subtotal: order.subtotal,
              shippingFee: order.shippingFee,
              discountTotal: order.discountTotal,
              total: order.total,
              address: order.address ?? null,
              deliveryLabel: order.deliveryLabel ?? null,
              isClubPickup: order.isClubPickup,
            };
            const invoicePdf = await generateStoreOrderInvoicePdf(invoiceDetails);
            void sendStoreOrderEmail(invoiceDetails, invoicePdf).catch((e) => console.error("[PAYMENT_ORDER_EMAIL]", e));
            void sendAdminOrderNotification(invoiceDetails).catch((e) => console.error("[PAYMENT_ORDER_ADMIN_EMAIL]", e));
          } catch (e) {
            console.error("[PAYMENT_ORDER_INVOICE_GEN]", e);
          }
        })();
      }
    }

    const metadata = parseJson(existing?.metadata);
    const privateSessionApplicationId =
      typeof metadata?.privateSessionApplicationId === "string"
        ? metadata.privateSessionApplicationId
        : null;

    if (privateSessionApplicationId) {
      const appForExpiry = await db.privateSessionApplication.findUnique({
        where: { id: privateSessionApplicationId },
        select: { durationDays: true },
      });
      const paidAt = transaction.paidAt ?? new Date();
      let expiresAt: Date | null = null;
      if (appForExpiry?.durationDays) {
        expiresAt = new Date(paidAt.getTime() + appForExpiry.durationDays * 24 * 60 * 60 * 1000);
      }
      await db.privateSessionApplication.updateMany({
        where: {
          id: privateSessionApplicationId,
          status: "approved",
        },
        data: {
          status: "paid",
          paymentTransactionId: transactionId,
          paidAt,
          ...(expiresAt ? { expiresAt } : {}),
        },
      });
      try {
        await ensurePrivateAttendancePass(privateSessionApplicationId);
      } catch {}
    }

    // Mark nutrition session as paid
    const nutritionSessionId =
      typeof metadata?.nutritionSessionId === "string" ? metadata.nutritionSessionId : null;
    if (nutritionSessionId) {
      const session = await db.nutritionSession.findFirst({
        where: { id: nutritionSessionId, status: "approved" },
        include: {
          nutritionist: { select: { userId: true, sessionCommissionRate: true, sessionCommissionType: true } },
        },
      });

      if (session) {
        await db.nutritionSession.update({
          where: { id: nutritionSessionId },
          data: { status: "paid", paidAt: transaction.paidAt ?? new Date(), paymentTransactionId: transactionId },
        });

        // Calculate and create session commission
        const { sessionCommissionRate, sessionCommissionType, userId: nutritionistUserId } = session.nutritionist;
        const actualPaidAmount = transaction.amount; // المبلغ المدفوع فعلياً

        if (sessionCommissionRate > 0 && actualPaidAmount > 0) {
          let rawCommission = 0;

          if (sessionCommissionType === "percentage") {
            rawCommission = (actualPaidAmount * sessionCommissionRate) / 100;
          } else {
            // fixed
            rawCommission = sessionCommissionRate;
          }

          // العمولة النهائية لا تتجاوز المبلغ المدفوع
          const finalCommission = Math.min(rawCommission, actualPaidAmount);
          // تقريب إلى رقمين عشريين (نفس قاعدة الأموال المستخدمة في المشروع)
          const roundedCommission = Math.round(finalCommission * 100) / 100;

          if (roundedCommission > 0) {
            // منع التكرار: استخدام try-catch للتعامل مع unique constraint
            try {
              await db.nutritionCommission.create({
                data: {
                  nutritionistUserId,
                  nutritionSessionId: session.id,
                  amount: roundedCommission,
                  status: "earned",
                },
              });
            } catch (err: any) {
              // إذا كان الخطأ بسبب duplicate nutritionSessionId، تجاهله (idempotent)
              if (!err.code || err.code !== "P2002") {
                throw err; // أي خطأ آخر يُرمى مرة أخرى
              }
            }
          }
        }

        if (existing?.userId) {
          await db.notification.create({
            data: {
              userId: existing.userId,
              title: "تم تأكيد حجز كشف دكتورة التغذية!",
              body: "تم استلام دفعتك بنجاح. ستتواصل معك الدكتورة قريباً.",
              type: "success",
            },
          }).catch(() => null);
        }
      }
    }
  }
  // end if (status === "paid")

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
    referenceCode: row.referenceCode,
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
    referenceCode: string | null;
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
    referenceCode: transaction.referenceCode,
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

  // If the reward was not yet given, give it now using admin-configured settings
  if (!usage.rewardGiven) {
    const cfg = await getRewardSettings();
    const rType  = cfg.referralRewardType;
    const rValue = cfg.referralRewardValue;
    const referrerUserId = usage.referral.userId;

    if (rType === "wallet") {
      const referrerWallet = await db.wallet.upsert({
        where: { userId: referrerUserId },
        update: {},
        create: { userId: referrerUserId, balance: 0 },
      });
      await db.wallet.update({
        where: { id: referrerWallet.id },
        data: { balance: { increment: rValue } },
      });
      await db.walletTransaction.create({
        data: {
          walletId: referrerWallet.id,
          amount: rValue,
          type: "credit",
          description: "مكافأة إحالة — اشترك العضو المُحال بنجاح",
        },
      });
    } else {
      const rp = await db.rewardPoints.findUnique({ where: { userId: referrerUserId } });
      if (rp) {
        const newPts = rp.points + rValue;
        await db.rewardPoints.update({
          where: { id: rp.id },
          data: { points: { increment: rValue }, tier: calcTier(newPts, cfg.tierThresholds) },
        });
        await db.rewardHistory.create({
          data: { rewardId: rp.id, points: rValue, reason: "referral_bonus" },
        });
      }
    }

    await db.referralUsage.update({
      where: { id: usage.id },
      data: { rewardGiven: true, rewardType: rType, rewardValue: rValue },
    });

    await db.referral.update({
      where: { id: usage.referral.id },
      data: { totalEarned: { increment: rValue } },
    });

    await db.notification.create({
      data: {
        userId: referrerUserId,
        title: "🎉 مكافأة إحالة!",
        body: rType === "wallet"
          ? `اشترك أحد أعضائك المُحالين بنجاح وحصلتِ على ${rValue} ج.م في محفظتك!`
          : `اشترك أحد أعضائك المُحالين بنجاح وحصلتِ على ${rValue} فيتزونة في رصيد مكافآتك!`,
        type: "success",
      },
    });
  }
}

/**
 * Verified Paymob Payment Recovery Input
 *
 * Used for manual recovery of Paymob payments where webhook was missed/failed
 * but payment was verified as successful through Paymob dashboard/API.
 *
 * ALL fields must match exactly or recovery is rejected as unsafe.
 */
export type VerifiedPaymobRecoveryInput = {
  paymentTransactionId: string;
  paymobTransactionId: string;
  expectedAmount: number;
  expectedCurrency: string;
  expectedFitZoneReference: string;
  expectedMerchantOrderId: string;
};

/**
 * Recover a verified Paymob payment with atomic validation and activation.
 *
 * CRITICAL SAFETY:
 * - Validates ALL payment details match expected values
 * - Uses SHARED activation helper (same logic as normal payment)
 * - Atomic claim: payment -> paid in ONE transaction with activation
 * - ALWAYS calls reconciliation (even if already paid/active) to handle crash-window
 * - Reconciliation is idempotent via row-lock + completion marker
 *
 * WHEN TO USE:
 * - Paymob dashboard shows "success" but webhook never arrived
 * - Customer paid but membership not activated
 * - ALL payment details manually verified through Paymob dashboard
 *
 * DO NOT USE FOR:
 * - Unverified payments
 * - Refunded/disputed payments
 * - Payments where amount/currency don't match exactly
 */
export async function recoverVerifiedPaymobPayment(input: VerifiedPaymobRecoveryInput) {
  const {
    paymentTransactionId,
    paymobTransactionId,
    expectedAmount,
    expectedCurrency,
    expectedFitZoneReference,
    expectedMerchantOrderId,
  } = input;

  // 1. Atomic verification, payment claim, and activation in ONE transaction
  const result = await db.$transaction(async (tx) => {
    // Load payment
    const payment = await tx.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
    });

    if (!payment) {
      throw new Error(`Payment transaction ${paymentTransactionId} not found`);
    }

    if (!payment.membershipId) {
      throw new Error("Recovery only supports membership payments");
    }

    // Validate amount and currency match exactly
    if (payment.amount !== expectedAmount || payment.currency.toUpperCase() !== expectedCurrency.toUpperCase()) {
      throw new Error(
        `Recovery rejected: amount or currency mismatch (expected ${expectedAmount} ${expectedCurrency}, found ${payment.amount} ${payment.currency})`
      );
    }

    // Validate FitZone reference matches
    if (payment.referenceCode !== expectedFitZoneReference) {
      throw new Error(
        `Recovery rejected: FitZone reference mismatch (expected ${expectedFitZoneReference}, found ${payment.referenceCode})`
      );
    }

    // Validate merchant order ID matches
    const metadata = parseJson(payment.metadata);
    const merchantOrderId = metadata?.merchantOrderId as string | undefined;
    if (merchantOrderId !== expectedMerchantOrderId) {
      throw new Error(
        `Recovery rejected: merchant order ID mismatch (expected ${expectedMerchantOrderId}, found ${merchantOrderId ?? "none"})`
      );
    }

    // Check for conflicting external reference
    if (payment.externalReference && payment.externalReference !== paymobTransactionId) {
      throw new Error(
        `Recovery rejected: Paymob transaction ID ${paymobTransactionId} conflicts with existing evidence ${payment.externalReference}`
      );
    }

    // Check for duplicate paid payment for same membership
    const duplicatePaid = await tx.paymentTransaction.findFirst({
      where: {
        membershipId: payment.membershipId,
        status: "paid",
        id: { not: paymentTransactionId },
      },
    });
    if (duplicatePaid) {
      throw new Error(
        `Recovery rejected: duplicate paid payment exists for membership ${payment.membershipId} (payment ${duplicatePaid.id})`
      );
    }

    // Check for duplicate active membership
    const membership = await tx.userMembership.findUnique({
      where: { id: payment.membershipId },
      select: {
        id: true,
        userId: true,
        membershipId: true,
        status: true,
      },
    });

    if (!membership) {
      throw new Error(`Membership ${payment.membershipId} not found`);
    }

    if (membership.status !== "pending_payment" && membership.status !== "active") {
      throw new Error(
        `Recovery rejected: membership ${payment.membershipId} is not recoverable (status: ${membership.status})`
      );
    }

    const duplicateActive = await tx.userMembership.findFirst({
      where: {
        userId: membership.userId,
        membershipId: membership.membershipId,
        status: "active",
        id: { not: payment.membershipId },
      },
    });
    if (duplicateActive) {
      throw new Error(
        `Recovery rejected: duplicate active membership exists for user ${membership.userId} / plan ${membership.membershipId}`
      );
    }

    // Atomic claim: mark payment as paid (idempotent if already paid)
    let alreadyPaid = false;
    if (payment.status === "paid" && payment.externalReference === paymobTransactionId) {
      alreadyPaid = true;
    } else {
      const claimed = await tx.paymentTransaction.updateMany({
        where: {
          id: paymentTransactionId,
          status: { in: ["pending", "pending_payment", "processing", "requires_action"] },
        },
        data: {
          status: "paid",
          paidAt: new Date(),
          externalReference: paymobTransactionId,
          metadata: stringifyJson({
            ...(metadata ?? {}),
            verifiedPaymobRecovery: true,
            recoveredAt: new Date().toISOString(),
            recoveredPaymobTxId: paymobTransactionId,
          }),
        },
      });

      if (claimed.count === 0) {
        throw new Error(`Payment ${paymentTransactionId} already processed or in terminal state`);
      }
    }

    // Use SHARED activation helper (same logic as normal payment)
    const activation = await activatePaidMembershipTx(tx, paymentTransactionId, payment.membershipId);

    if (!activation.success || !activation.membershipData) {
      throw new Error(`Membership ${payment.membershipId} activation failed`);
    }

    // Refresh payment data
    const updatedPayment = await tx.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
    });

    return {
      alreadyPaid,
      transaction: updatedPayment!,
      membershipData: activation.membershipData,
    };
  });

  // Record analytics event (fire-and-forget)
  void recordMembershipActivatedEvent(result.transaction.membershipId!, paymentTransactionId).catch(() => null);

  // CRITICAL: ALWAYS call reconciliation, even if payment/membership were already activated
  // The reconciliation helper has its own row-lock + completion marker to ensure exact-once
  // This handles the crash-window case where activation succeeded but reconciliation failed
  await runPaidMembershipPostActivationReconciliation({
    transactionId: paymentTransactionId,
    userId: result.transaction.userId,
    userMembershipId: result.transaction.membershipId!,
    membershipData: result.membershipData,
    paymentAmount: result.transaction.amount,
    paymentMethod: result.transaction.paymentMethod,
    paidAt: result.transaction.paidAt,
    transactionMetadata: result.transaction.metadata,
  });

  return mapPaymentTransaction(result.transaction);
}
