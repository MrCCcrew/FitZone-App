import { asDbTransactionClient, db } from "@/lib/db";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import { accruePrivateSessionEarningTx } from "@/lib/employees/private-session-earning-service";
import {
  buildAttendancePayload,
  ensureMembershipAttendancePass,
  ensurePrivateAttendancePass,
} from "@/lib/attendance";
import {
  sendSubscriptionEmail,
  sendAdminSubscriptionNotification,
  sendStoreOrderEmail,
  sendAdminOrderNotification,
} from "@/lib/email";
import { generateStoreOrderInvoicePdf } from "@/lib/store-order-invoice";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";
import {
  postPromotionalPointsGrantJournal,
  postPromotionalWalletCreditJournal,
} from "@/lib/accounting-service";
import { generateMembershipQrCard } from "@/lib/membership-card";
import {
  generateMembershipInvoicePdf,
  type MembershipInvoiceDetails,
} from "@/lib/membership-invoice";
import { recordPaymentStatusEvent } from "@/lib/analytics/payment-events";
import { recordMembershipActivatedEvent } from "@/lib/analytics/membership-events";
import {
  getDefaultPaymentProvider,
  getPaymentProvider,
  listPaymentProviders,
} from "@/lib/payments/registry";
import { runPaidMembershipPostActivationReconciliation } from "@/lib/payments/reconciliation-helper";
import { markFriendOfferParticipantPaid } from "@/lib/payments/friend-offer-payment";
import { releaseMarketingFriendOfferLockTx } from "@/lib/marketing-conversion-service";
import {
  applyMembershipBookingPlanTx,
  ensureMembershipBookingsTx,
} from "@/lib/payments/membership-booking-plan";
import { verifyPaymobTransactionForRecovery } from "@/lib/payments/providers/paymob";
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

type PaymentReferenceDbClient = Pick<
  typeof db,
  "userMembership" | "paymentReferenceCounter"
>;

type WalletTopupTestFailpoint = "credit" | "ledger" | null;
let walletTopupTestFailpoint: WalletTopupTestFailpoint = null;

/** Test-only hook used by real transaction tests to prove rollback behavior. */
export function setWalletTopupTestFailpoint(
  failpoint: WalletTopupTestFailpoint,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Wallet top-up failpoints are available only in tests.");
  }
  walletTopupTestFailpoint = failpoint;
}

function triggerWalletTopupTestFailpoint(
  stage: Exclude<WalletTopupTestFailpoint, null>,
) {
  if (process.env.NODE_ENV === "test" && walletTopupTestFailpoint === stage) {
    throw new Error(`WALLET_TOPUP_TEST_FAILPOINT:${stage}`);
  }
}

function normalizeExternalPaymentMethod(method: string | null | undefined) {
  const raw = String(method ?? "")
    .trim()
    .toLowerCase();

  if (
    raw === "wallet" ||
    raw === "free" ||
    raw === "membership" ||
    raw === "offer" ||
    raw === "cod" ||
    raw === "cash_on_delivery"
  ) {
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

async function ensureMembershipBookingsFromPaymentMetadataTx(
  tx: any,
  input: {
    userId: string;
    userMembershipId: string;
    metadata: string | null | undefined;
  },
) {
  const metadata = parseJson(input.metadata);

  const recoveryData =
    metadata?.bookingRecoveryData &&
    typeof metadata.bookingRecoveryData === "object"
      ? (metadata.bookingRecoveryData as Record<string, unknown>)
      : null;

  const rawSelectedScheduleIds = recoveryData?.selectedScheduleIds;

  const selectedScheduleIds = Array.isArray(rawSelectedScheduleIds)
    ? [
        ...new Set(
          rawSelectedScheduleIds.filter(
            (id): id is string => typeof id === "string" && id.trim() !== "",
          ),
        ),
      ]
    : [];

  const membership = await tx.userMembership.findUnique({
    where: {
      id: input.userMembershipId,
    },
    select: {
      id: true,
      userId: true,
      startDate: true,
      endDate: true,
      status: true,
      membershipId: true,
      offerId: true,
      totalSessions: true,
      snapshotDurationDays: true,
      bookingPatternSnapshot: true,
      membership: {
        select: {
          kind: true,
          duration: true,
          sessionsCount: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error(
      `Booking plan failed: membership ${input.userMembershipId} not found`,
    );
  }

  if (membership.userId !== input.userId) {
    throw new Error(
      `Booking plan failed: membership ${input.userMembershipId} does not belong to user ${input.userId}`,
    );
  }

  if (membership.status !== "active") {
    throw new Error(
      `Booking plan failed: membership ${input.userMembershipId} is "${membership.status}", expected "active"`,
    );
  }

  if (membership.bookingPatternSnapshot) {
    const result = await ensureMembershipBookingsTx({
      tx,
      userMembershipId: membership.id,
    });

    console.info(
      `[PAYMENT_BOOKINGS] Membership ${input.userMembershipId}: ` +
        `${result.createdCount} new bookings, ${result.bookedSchedules.length} total owned bookings`,
    );

    return {
      applied: true,
      reason: "frozen_booking_contract_applied" as const,
      createdCount: result.createdCount,
      bookedCount: result.bookedSchedules.length,
    };
  }

  // Legacy memberships without a frozen booking contract still rely on
  // payment metadata to prove the original booking intent.
  if (selectedScheduleIds.length === 0) {
    return {
      applied: false,
      reason: "no_selected_schedules" as const,
      createdCount: 0,
    };
  }

  const duration =
    membership.snapshotDurationDays ?? membership.membership.duration;

  const sessionsCount =
    membership.totalSessions ?? membership.membership.sessionsCount ?? null;

  const result = await applyMembershipBookingPlanTx({
    tx,
    userId: input.userId,
    userMembershipId: input.userMembershipId,
    startDate: membership.startDate,
    endDate: membership.endDate,
    selectedScheduleIds,
    source: membership.offerId
      ? { type: "offer", id: membership.offerId }
      : {
          type:
            membership.membership.kind === "package" ? "package" : "membership",
          id: membership.membershipId,
        },
    plan: {
      kind: membership.membership.kind,
      sessionsCount,
      duration,
    },
  });

  console.info(
    `[PAYMENT_BOOKINGS] Membership ${input.userMembershipId}: ` +
      `${result.createdCount} new bookings, ${result.bookedSchedules.length} total owned bookings`,
  );

  return {
    applied: true,
    reason: "booking_plan_applied" as const,
    createdCount: result.createdCount,
    bookedCount: result.bookedSchedules.length,
  };
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
  membershipId: string,
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
      userId: true,
      status: true,
      pendingExpiresAt: true,
      offerId: true,
      snapshotDurationDays: true,
      membership: {
        select: {
          name: true,
          nameEn: true,
          kind: true,
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
    console.warn(
      `[ACTIVATION] Membership ${membershipId} not found (deleted by cron?)`,
    );
    return { success: false, membershipData: null };
  }

  // Serialize payment activation with admin entitlement recovery.
  await lockMembershipLifecycleUserTx(
    asDbTransactionClient(tx),
    membership.userId,
  );

  // Late payment check: if cancelled by cron after timeout
  if (membership.status === "cancelled") {
    console.warn(
      `[ACTIVATION] Late payment for membership ${membershipId}. ` +
        `Cron already cancelled it. Booking spots may have been reassigned. Manual review required.`,
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
    const duration =
      membership.snapshotDurationDays ?? membership.membership?.duration ?? 30;
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
    const duration =
      membership.snapshotDurationDays ?? membership.membership?.duration ?? 30;
    const endDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    // Atomic activation: race vs cron cleanup
    const activated = await tx.userMembership.updateMany({
      where: { id: membershipId, status: "pending_payment" },
      data: {
        status: "active",
        activatedAt: now,
        startDate: now,
        endDate,
        pendingExpiresAt: null, // Clear timeout on successful activation
      },
    });

    if (activated.count === 0) {
      console.warn(
        `[ACTIVATION] Membership ${membershipId} already processed (cron won race)`,
      );
      return { success: false, membershipData: null };
    }

    // The new membership is economically finalized now.
    // Only at this point may it supersede older active memberships.
    if (membership.membership?.kind !== "trial") {
      await tx.userMembership.updateMany({
        where: {
          userId: membership.userId,
          status: "active",
          id: { not: membershipId },
        },
        data: { status: "expired" },
      });
    }

    console.log(
      `[ACTIVATION] Successfully activated membership ${membershipId}`,
    );
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

function extractPaymentAdjustments(
  metadata: Record<string, unknown> | null | undefined,
) {
  const adjustmentRecord =
    metadata?.paymentAdjustments &&
    typeof metadata.paymentAdjustments === "object"
      ? (metadata.paymentAdjustments as Record<string, unknown>)
      : null;
  const invoiceRecord =
    metadata?.membershipInvoice &&
    typeof metadata.membershipInvoice === "object"
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

  const restoredAt =
    typeof adjustmentRecord?.restoredAt === "string"
      ? adjustmentRecord.restoredAt
      : null;

  return {
    walletAmount: Number.isFinite(walletAmount) ? Math.max(0, walletAmount) : 0,
    pointsCount: Number.isFinite(pointsCount)
      ? Math.max(0, Math.floor(pointsCount))
      : 0,
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
          description:
            `استرجاع رصيد محفظة لعملية غير مكتملة ${input.reference ?? ""}`.trim(),
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
          reason:
            `استرجاع فيتزونات ولاء لعملية غير مكتملة ${input.reference ?? ""}`.trim(),
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
    if (
      adjustments.restoredAt ||
      (adjustments.walletAmount <= 0 && adjustments.pointsCount <= 0)
    )
      return;

    if (adjustments.walletAmount > 0) {
      const wallet = await tx.wallet.upsert({
        where: { userId: transaction.userId },
        update: { balance: { increment: adjustments.walletAmount } },
        create: {
          userId: transaction.userId,
          balance: adjustments.walletAmount,
        },
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
        create: {
          userId: transaction.userId,
          points: adjustments.pointsCount,
          tier: "bronze",
        },
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
            ...((metadata?.paymentAdjustments as
              Record<string, unknown> | undefined) ?? {}),
            walletAmount: adjustments.walletAmount,
            pointsCount: adjustments.pointsCount,
            restoredAt: new Date().toISOString(),
          },
        }),
      },
    });
  });
}

function toInvoiceDetails(
  value: Record<string, unknown> | null | undefined,
): MembershipInvoiceDetails | null {
  if (!value || typeof value !== "object") return null;
  const raw = value.membershipInvoice;
  if (!raw || typeof raw !== "object") return null;
  const invoice = raw as Record<string, unknown>;
  const endDateValue = invoice.endDate
    ? new Date(String(invoice.endDate))
    : null;
  if (!endDateValue || Number.isNaN(endDateValue.getTime())) return null;
  const startDateValue = invoice.startDate
    ? new Date(String(invoice.startDate))
    : null;
  const issuedAtValue = invoice.issuedAt
    ? new Date(String(invoice.issuedAt))
    : undefined;
  return {
    invoiceNumber: String(invoice.invoiceNumber ?? ""),
    customerName: String(invoice.customerName ?? "FitZone Member"),
    customerEmail: String(invoice.customerEmail ?? ""),
    membershipName: String(invoice.membershipName ?? "Membership plan"),
    membershipNameEn: invoice.membershipNameEn
      ? String(invoice.membershipNameEn)
      : null,
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
    startDate:
      startDateValue && !Number.isNaN(startDateValue.getTime())
        ? startDateValue
        : null,
    endDate: endDateValue,
    issuedAt:
      issuedAtValue && !Number.isNaN(issuedAtValue.getTime())
        ? issuedAtValue
        : undefined,
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

    const membershipKind = String(membership?.membership?.kind ?? "")
      .trim()
      .toLowerCase();
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

export async function createPaymentTransaction(
  input: CreatePaymentTransactionInput,
) {
  const requestedProviderKey = String(input.provider ?? "")
    .trim()
    .toLowerCase();
  const requestedProvider = getPaymentProvider(requestedProviderKey);
  const provider =
    requestedProviderKey === "paymob" && requestedProvider?.enabled
      ? requestedProvider
      : getDefaultPaymentProvider();

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("قيمة الدفع غير صحيحة.");
  }

  /* WALLET_TOPUP_BONUS_CHECKOUT_SNAPSHOT */
  let paymentMetadata: Record<string, unknown> = {
    description: input.description ?? null,
    ...(input.metadata ?? {}),
  };

  if (input.purpose === "wallet_topup") {
    const rewardSettings = await getRewardSettings();

    const rawBonusPercent = Number(rewardSettings.walletTopupBonusPercent ?? 0);

    const bonusPercent =
      Number.isFinite(rawBonusPercent) &&
      rawBonusPercent >= 0 &&
      rawBonusPercent <= 100
        ? rawBonusPercent
        : 0;

    const bonusAmount = Math.round(((amount * bonusPercent) / 100) * 100) / 100;

    /*
     * Server-owned immutable financial snapshot.
     * These properties intentionally override any same-named values
     * supplied through input.metadata.
     */
    paymentMetadata = {
      ...paymentMetadata,
      walletTopupBonusSnapshotVersion: 1,
      walletTopupBonusPercent: bonusPercent,
      walletTopupBonusAmount: bonusAmount,
    };
  }

  const transaction = await db.$transaction(async (tx) => {
    const referenceCategory = await resolvePaymentReferenceCategory(tx, input);
    const referenceCode = await generatePaymentReferenceCode(
      tx,
      referenceCategory,
    );

    return tx.paymentTransaction.create({
      data: {
        userId: input.userId,
        orderId: input.orderId ?? null,
        membershipId: input.membershipId ?? null,
        offerId: input.offerId ?? null,
        referenceCode,
        purpose: input.purpose,
        businessUnit:
          input.businessUnit ?? getDefaultBusinessUnit(input.purpose),
        provider: provider.key,
        amount,
        currency: (input.currency || "EGP").toUpperCase(),
        paymentMethod: normalizeExternalPaymentMethod(input.paymentMethod),
        returnUrl: input.returnUrl ?? null,
        cancelUrl: input.cancelUrl ?? null,
        metadata: stringifyJson(paymentMetadata),
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

  const provider =
    getPaymentProvider(transaction.provider) ?? getDefaultPaymentProvider();
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
      providerReference:
        verification.providerReference ?? transaction.providerReference,
      externalReference:
        verification.externalReference ?? transaction.externalReference,
      providerPayload: stringifyJson(
        verification.payload ?? parseJson(transaction.providerPayload),
      ),
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
    return updatePaymentTransactionStatus(
      transactionId,
      verification.status,
      null,
    );
  }

  const updated = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
  });
  return mapPaymentTransaction(updated!, verification.message);
}

async function reconcilePaidPrivateSessionApplication(input: {
  transactionId: string;
  privateSessionApplicationId: string;
  paidAt: Date;
}) {
  const { transactionId, privateSessionApplicationId, paidAt } = input;

  await db.$transaction(async (tx) => {
    const application = await tx.privateSessionApplication.findUnique({
      where: {
        id: privateSessionApplicationId,
      },
      select: {
        status: true,
        paymentTransactionId: true,
        durationDays: true,
      },
    });

    if (!application) {
      throw new Error("PRIVATE_SESSION_PAYMENT_APPLICATION_NOT_FOUND");
    }

    if (application.status === "approved") {
      const expiresAt = application.durationDays
        ? new Date(
            paidAt.getTime() + application.durationDays * 24 * 60 * 60 * 1000,
          )
        : null;

      await tx.privateSessionApplication.updateMany({
        where: {
          id: privateSessionApplicationId,
          status: "approved",
        },
        data: {
          status: "paid",
          paymentTransactionId: transactionId,
          paidAt,
          ...(expiresAt
            ? {
                expiresAt,
              }
            : {}),
        },
      });
    } else if (application.status === "paid") {
      if (application.paymentTransactionId !== transactionId) {
        throw new Error("PRIVATE_SESSION_PAYMENT_TRANSACTION_MISMATCH");
      }
    } else {
      throw new Error("PRIVATE_SESSION_PAYMENT_APPLICATION_NOT_PAYABLE");
    }

    await accruePrivateSessionEarningTx(asDbTransactionClient(tx), {
      privateSessionApplicationId,
    });
  });

  try {
    await ensurePrivateAttendancePass(privateSessionApplicationId);
  } catch {}
}

export async function updatePaymentTransactionStatus(
  transactionId: string,
  status: PaymentStatus,
  note?: string | null,
) {
  const existing = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: {
      status: true,
      metadata: true,
      membershipId: true,
      orderId: true,
      userId: true,
      purpose: true,
    },
  });

  // Idempotency: an already-paid retry must still repair
  // recoverable business-side effects that may be missing.
  if (existing?.status === "paid" && status === "paid") {
    await markFriendOfferParticipantPaid(transactionId);

    const current = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    const retryMetadata = parseJson(current?.metadata);

    const retryPrivateSessionApplicationId =
      typeof retryMetadata?.privateSessionApplicationId === "string"
        ? retryMetadata.privateSessionApplicationId
        : null;

    if (
      current?.purpose === "private_session" &&
      retryPrivateSessionApplicationId
    ) {
      await reconcilePaidPrivateSessionApplication({
        transactionId,
        privateSessionApplicationId: retryPrivateSessionApplicationId,
        paidAt: current.paidAt ?? new Date(),
      });
    }

    return mapPaymentTransaction(current!);
  }

  if (status === "paid" && existing?.purpose === "wallet_topup") {
    await db.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({
        where: { id: transactionId },
        select: {
          id: true,
          userId: true,
          amount: true,
          currency: true,
          status: true,
          purpose: true,
          referenceCode: true,
          metadata: true,
        },
      });

      if (!payment) {
        throw new Error("معاملة الدفع غير موجودة.");
      }

      if (
        payment.purpose !== "wallet_topup" ||
        payment.currency.toUpperCase() !== "EGP"
      ) {
        throw new Error("معاملة شحن المحفظة غير صالحة.");
      }

      /*
       * WALLET_TOPUP_BONUS_FINALIZATION
       *
       * Historical rule:
       * only a transaction carrying our explicit server-side snapshot
       * version receives a bonus.
       *
       * Legacy transactions therefore receive exactly zero bonus.
       */
      const metadata = parseJson(payment.metadata);

      const hasBonusSnapshot = metadata?.walletTopupBonusSnapshotVersion === 1;

      const rawBonusAmount = hasBonusSnapshot
        ? Number(metadata?.walletTopupBonusAmount ?? 0)
        : 0;

      const bonusAmount =
        Number.isFinite(rawBonusAmount) && rawBonusAmount > 0
          ? Math.round(rawBonusAmount * 100) / 100
          : 0;

      const totalWalletCredit =
        Math.round((payment.amount + bonusAmount) * 100) / 100;

      const claimed = await tx.paymentTransaction.updateMany({
        where: {
          id: payment.id,
          status: {
            in: ["pending", "pending_payment", "processing", "requires_action"],
          },
        },
        data: {
          status: "paid",
          paidAt: new Date(),
        },
      });

      /*
       * Exact-once boundary.
       * Concurrent/repeated paid callbacks cannot issue principal
       * or promotional credit twice.
       */
      if (claimed.count === 0) return null;

      triggerWalletTopupTestFailpoint("credit");

      const wallet = await tx.wallet.upsert({
        where: {
          userId: payment.userId,
        },
        update: {
          balance: {
            increment: totalWalletCredit,
          },
        },
        create: {
          userId: payment.userId,
          balance: totalWalletCredit,
        },
      });

      triggerWalletTopupTestFailpoint("ledger");

      /*
       * Principal ledger movement.
       * This represents actual customer money received.
       */
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: payment.amount,
          type: "credit",
          description: `شحن محفظة عبر ${payment.referenceCode ?? payment.id}`,
        },
      });

      /*
       * Principal GL:
       * Dr Paymob Clearing
       * Cr Wallet Liability
       */
      const { postWalletTopupJournal } =
        await import("@/lib/accounting-service");

      await postWalletTopupJournal(tx, payment.id, payment.amount);

      /*
       * Promotional bonus has its own ledger movement and GL entry.
       * It must never be mixed with collected cash.
       */
      if (bonusAmount > 0) {
        const snapshotPercent = Number(metadata?.walletTopupBonusPercent ?? 0);

        const bonusTransaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: bonusAmount,
            type: "credit",
            description: `بونص شحن المحفظة ${
              Number.isFinite(snapshotPercent) ? snapshotPercent : 0
            }% للمعاملة ${payment.referenceCode ?? payment.id}`,
          },
        });

        await postPromotionalWalletCreditJournal(
          tx,
          bonusTransaction.id,
          bonusAmount,
        );
      }

      return payment.id;
    });

    const current = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!current) throw new Error("معاملة الدفع غير موجودة.");
    return mapPaymentTransaction(current);
  }

  const previousStatus = existing?.status;
  const isFailureTerminal =
    status === "failed" || status === "cancelled" || status === "expired";

  const existingFailureMetadata = parseJson(existing?.metadata);
  const isSupersededStoreOrderFailure =
    isFailureTerminal &&
    existing?.purpose === "order" &&
    (
      typeof existingFailureMetadata?.storeRetryClaimedAt === "string" ||
      typeof existingFailureMetadata?.storeRetrySupersededByPaymentTransactionId === "string"
    );

  const paymentResult = isFailureTerminal
    ? await db.$transaction(async (tx) => {
        const current = await tx.paymentTransaction.findUnique({
          where: { id: transactionId },
        });

        if (!current) {
          throw new Error("معاملة الدفع غير موجودة.");
        }

        // A confirmed payment must never be downgraded by a stale
        // failed/cancelled/expired signal.
        if (current.status === "paid") {
          return { payment: current, paidGuard: true };
        }

        const alreadyTerminal =
          current.status === "failed" ||
          current.status === "cancelled" ||
          current.status === "expired";

        const payment = alreadyTerminal
          ? current
          : await tx.paymentTransaction.update({
              where: { id: transactionId },
              data: {
                status,
                metadata: stringifyJson({
                  ...(parseJson(current.metadata) ?? {}),
                  ...(note != null ? { adminNote: note } : {}),
                }),
                failedAt: status === "failed" ? new Date() : undefined,
              },
            });

        /*
         * Friend Offer payments have no membershipId until the
         * whole group finalizes. Release the frozen marketing
         * checkout attribution immediately on terminal failure.
         *
         * A paid transaction is protected above and never reaches
         * this branch.
         */
        const failureMetadata = parseJson(current.metadata);
        const friendParticipantId =
          failureMetadata?.source === "friend-offer" &&
          typeof failureMetadata.friendParticipantId === "string"
            ? failureMetadata.friendParticipantId.trim()
            : "";

        if (friendParticipantId) {
          await releaseMarketingFriendOfferLockTx(
            asDbTransactionClient(tx),
            friendParticipantId,
          );
        }

        const failedMembershipId = current.membershipId;

        if (failedMembershipId) {
          const membershipClaim = await tx.userMembership.updateMany({
            where: {
              id: failedMembershipId,
              status: "pending_payment",
            },
            data: { status: "expired" },
          });

          if (membershipClaim.count > 0) {
            const pendingBookings = await tx.booking.findMany({
              where: {
                userMembershipId: failedMembershipId,
                status: "confirmed",
              },
              select: {
                id: true,
                scheduleId: true,
              },
            });

            if (pendingBookings.length > 0) {
              await tx.booking.updateMany({
                where: {
                  id: { in: pendingBookings.map((b) => b.id) },
                  status: "confirmed",
                },
                data: { status: "cancelled" },
              });

              const restoreCounts = new Map<string, number>();

              for (const booking of pendingBookings) {
                restoreCounts.set(
                  booking.scheduleId,
                  (restoreCounts.get(booking.scheduleId) ?? 0) + 1,
                );
              }

              for (const [scheduleId, count] of restoreCounts) {
                await tx.schedule.update({
                  where: { id: scheduleId },
                  data: {
                    availableSpots: { increment: count },
                  },
                });
              }
            }
          }
        }

        return { payment, paidGuard: false };
      })
    : {
        payment: await db.paymentTransaction.update({
          where: { id: transactionId },
          data: {
            status,
            metadata: stringifyJson({
              ...(parseJson(existing?.metadata) ?? {}),
              ...(note != null ? { adminNote: note } : {}),
            }),
            paidAt: status === "paid" ? new Date() : undefined,
          },
        }),
        paidGuard: false,
      };

  const transaction = paymentResult.payment;

  if (paymentResult.paidGuard) {
    return mapPaymentTransaction(transaction);
  }

  const wasOpen =
    previousStatus === "pending" ||
    previousStatus === "processing" ||
    previousStatus === "requires_action";

  if (
    wasOpen &&
    (status === "paid" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "expired")
  ) {
    void recordPaymentStatusEvent(transactionId, status).catch(() => null);
  }

  if (isFailureTerminal) {
    await restorePaymentTransactionAdjustments(transactionId);

    // Phase 2C: Release reservation for failed orders
    const failedOrderId = existing?.orderId;
    if (failedOrderId) {
      const { releaseOrderReservation } =
        await import("@/lib/inventory-service");

      await db.$transaction(
        async (tx) => {
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
            failedOrderId,
          );

          // Cancel order
          await tx.order.update({
            where: { id: failedOrderId },
            data: {
              status: "cancelled",
              cancelledAt: new Date(),
            },
          });
        },
        { timeout: 10000 },
      );
    }

    const restored = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
    });
    return mapPaymentTransaction(restored!);
  }

  // Activate linked membership or order when payment confirmed
  if (status === "paid") {
    await markFriendOfferParticipantPaid(transactionId);

    if (existing?.membershipId) {
      // ── Activate membership with race condition protection ────────────────
      const membershipId = existing.membershipId; // TypeScript narrowing
      let activationSucceeded = false;
      let membershipData: {
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
      } | null = null;

      await db.$transaction(async (tx) => {
        const result = await activatePaidMembershipTx(
          tx,
          transactionId,
          membershipId,
        );

        activationSucceeded = result.success;
        membershipData = result.membershipData;

        if (result.success && result.membershipData) {
          await ensureMembershipBookingsFromPaymentMetadataTx(tx, {
            userId: existing.userId,
            userMembershipId: membershipId,
            metadata: transaction.metadata,
          });
        }
      });

      if (!activationSucceeded || !membershipData) {
        // Webhook lost race or membership already processed
        return mapPaymentTransaction(transaction);
      }
      void recordMembershipActivatedEvent(
        existing.membershipId,
        transactionId,
      ).catch(() => null);

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
      const { confirmOrderInventoryAllocationSale } =
        await import("@/lib/order-inventory-allocation-service");

      const order = await db.order.findUnique({
        where: { id: existing.orderId },
        select: {
          status: true,
          subtotal: true,
          shippingFee: true,
          discountTotal: true,
          total: true,
          paymentMethod: true,
          address: true,
          deliveryLabel: true,
          isClubPickup: true,
          inventoryDeducted: true,
          items: { include: { product: { select: { name: true } } } },
        },
      });

      if (order?.status === "pending" && !order.inventoryDeducted) {
        // Phase 2C: Convert reservation → sale
        await db.$transaction(
          async (tx) => {
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
            const saleResults = await confirmOrderInventoryAllocationSale(
              tx,
              existing.orderId!,
            );

            // Phase 4: Post GL journal for sale.
            // This is intentionally fail-closed inside the same transaction:
            // if accounting fails, order/inventory/allocation/consignment
            // liability changes must all roll back.
            const { postAllocatedSaleJournal } =
              await import("@/lib/accounting-service");

            await postAllocatedSaleJournal(
              tx,
              existing.orderId!,
              order.total,
              saleResults,
              order.paymentMethod,
            );
          },
          { timeout: 15000 },
        );
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
              paymentMethod:
                transaction.paymentMethod ?? order.paymentMethod ?? "paymob",
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
            const invoicePdf =
              await generateStoreOrderInvoicePdf(invoiceDetails);
            void sendStoreOrderEmail(invoiceDetails, invoicePdf).catch((e) =>
              console.error("[PAYMENT_ORDER_EMAIL]", e),
            );
            void sendAdminOrderNotification(invoiceDetails).catch((e) =>
              console.error("[PAYMENT_ORDER_ADMIN_EMAIL]", e),
            );
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
      await reconcilePaidPrivateSessionApplication({
        transactionId,
        privateSessionApplicationId,
        paidAt: transaction.paidAt ?? new Date(),
      });
    }

    // Mark nutrition session as paid
    const nutritionSessionId =
      typeof metadata?.nutritionSessionId === "string"
        ? metadata.nutritionSessionId
        : null;
    if (nutritionSessionId) {
      const session = await db.nutritionSession.findFirst({
        where: { id: nutritionSessionId, status: "approved" },
        include: {
          nutritionist: {
            select: {
              userId: true,
              sessionCommissionRate: true,
              sessionCommissionType: true,
            },
          },
        },
      });

      if (session) {
        await db.nutritionSession.update({
          where: { id: nutritionSessionId },
          data: {
            status: "paid",
            paidAt: transaction.paidAt ?? new Date(),
            paymentTransactionId: transactionId,
          },
        });

        // Calculate and create session commission
        const {
          sessionCommissionRate,
          sessionCommissionType,
          userId: nutritionistUserId,
        } = session.nutritionist;
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
          await db.notification
            .create({
              data: {
                userId: existing.userId,
                title: "تم تأكيد حجز كشف دكتورة التغذية!",
                body: "تم استلام دفعتك بنجاح. ستتواصل معك الدكتورة قريباً.",
                type: "success",
              },
            })
            .catch(() => null);
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

let referralRewardTestFailpoint: "after_activation" | "after_reward" | null =
  null;

export function setReferralRewardTestFailpoint(
  value: typeof referralRewardTestFailpoint,
) {
  referralRewardTestFailpoint = value;
}

function triggerReferralRewardTestFailpoint(
  point: Exclude<typeof referralRewardTestFailpoint, null>,
) {
  if (
    process.env.NODE_ENV === "test" &&
    referralRewardTestFailpoint === point
  ) {
    throw new Error(`REFERRAL_REWARD_TEST_FAILPOINT:${point}`);
  }
}

// Called after a subscription becomes active — rewards the referrer who brought this user.
// Protected against concurrent activation/reward attempts and fully atomic.
export async function unlockPendingReferralReward(subscribedUserId: string) {
  const cfg = await getRewardSettings();

  await db.$transaction(async (tx) => {
    // Serialize concurrent attempts for the same referred user.
    await tx.$queryRaw`
      SELECT id
      FROM ReferralUsage
      WHERE referredUserId = ${subscribedUserId}
      FOR UPDATE
    `;

    const usage = await tx.referralUsage.findUnique({
      where: { referredUserId: subscribedUserId },
      include: {
        referral: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!usage || usage.subscriptionActivated) {
      return;
    }

    // Mark subscription activation first, but inside the same transaction.
    await tx.referralUsage.update({
      where: { id: usage.id },
      data: {
        subscriptionActivated: true,
        subscriptionActivatedAt: new Date(),
      },
    });

    triggerReferralRewardTestFailpoint("after_activation");

    await tx.referral.update({
      where: { id: usage.referral.id },
      data: {
        subscriptionActivatedCount: {
          increment: 1,
        },
      },
    });

    // Preserve historical/legacy behavior:
    // if the referral was already rewarded by an older flow,
    // only activate/count it and do not grant another reward.
    if (usage.rewardGiven) {
      return;
    }

    const rType = cfg.referralRewardType;
    const rValue = Number(cfg.referralRewardValue ?? 0);
    const referrerUserId = usage.referral.userId;

    if (rValue <= 0) {
      await tx.referralUsage.update({
        where: { id: usage.id },
        data: {
          rewardGiven: true,
          rewardType: rType,
          rewardValue: 0,
        },
      });

      return;
    }

    if (rType === "wallet") {
      const wallet = await tx.wallet.upsert({
        where: { userId: referrerUserId },
        update: {},
        create: {
          userId: referrerUserId,
          balance: 0,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: rValue,
          },
        },
      });

      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: rValue,
          type: "credit",
          description: "مكافأة إحالة — اشترك العضو المُحال بنجاح",
        },
      });

      await postPromotionalWalletCreditJournal(
        tx,
        walletTransaction.id,
        rValue,
      );

      triggerReferralRewardTestFailpoint("after_reward");
    } else {
      const rp = await tx.rewardPoints.upsert({
        where: { userId: referrerUserId },
        update: {},
        create: {
          userId: referrerUserId,
          points: 0,
          tier: "bronze",
        },
      });

      const newPts = rp.points + rValue;

      await tx.rewardPoints.update({
        where: { id: rp.id },
        data: {
          points: {
            increment: rValue,
          },
          tier: calcTier(newPts, cfg.tierThresholds),
        },
      });

      const grantedPoints = Math.floor(rValue);

      const rewardHistory = await tx.rewardHistory.create({
        data: {
          rewardId: rp.id,
          points: grantedPoints,
          reason: "referral_bonus",
        },
      });

      const pointsLiabilityAmount =
        Math.round(grantedPoints * Number(cfg.pointValueEGP ?? 0) * 100) / 100;

      await postPromotionalPointsGrantJournal(
        tx,
        rewardHistory.id,
        pointsLiabilityAmount,
      );

      triggerReferralRewardTestFailpoint("after_reward");
    }

    await tx.referralUsage.update({
      where: { id: usage.id },
      data: {
        rewardGiven: true,
        rewardType: rType,
        rewardValue: rValue,
      },
    });

    await tx.referral.update({
      where: { id: usage.referral.id },
      data: {
        totalEarned: {
          increment: rValue,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: referrerUserId,
        title: "🎉 مكافأة إحالة!",
        body:
          rType === "wallet"
            ? `اشترك أحد أعضائك المُحالين بنجاح وحصلتِ على ${rValue} ج.م في محفظتك!`
            : `اشترك أحد أعضائك المُحالين بنجاح وحصلتِ على ${rValue} فيتزونة في رصيد مكافآتك!`,
        type: "success",
      },
    });
  });
}

/**
 * Verified Paymob Payment Recovery Input
 *
 * Used for manual recovery of Paymob payments where webhook was missed/failed
 * but payment was verified as successful through Paymob dashboard/API.
 *
 * CRITICAL SAFETY:
 * - Recovery performs REMOTE Paymob verification BEFORE any local mutations
 * - Intention ID (providerReference) is the authoritative linkage
 * - Transaction is verified to belong to intention via Paymob API
 * - ALL validation must pass or recovery is rejected
 */
export type VerifiedPaymobRecoveryInput = {
  paymentTransactionId: string;
  paymobTransactionId: string;
  expectedAmount: number;
  expectedCurrency: string;
  expectedFitZoneReference: string;
  expectedIntentionId: string;
};

/**
 * Private helper: Restore deleted bookings from payment metadata during late payment recovery.
 * NON-FATAL: Recovery succeeds even if booking restoration fails.
 */
async function restoreBookingsFromMetadata(
  userId: string,
  userMembershipId: string,
  paymentMetadata: string | null,
): Promise<void> {
  try {
    // 1. Check if bookings already exist
    const existingBookingsCount = await db.booking.count({
      where: { userMembershipId },
    });

    if (existingBookingsCount > 0) {
      console.info(
        `[BOOKING_RECOVERY] Membership ${userMembershipId} already has ${existingBookingsCount} bookings - skip restoration`,
      );
      return;
    }

    // 2. Parse metadata safely
    const metadata = parseJson(paymentMetadata);
    if (!metadata) {
      console.info(
        `[BOOKING_RECOVERY] No metadata available for booking recovery`,
      );
      return;
    }

    // 3. Get schedule IDs - prefer snapshot, fallback to original selection
    let scheduleIdsToRestore: string[] = [];

    const snapshot = metadata.deletedBookingsSnapshot as
      | {
          bookings?: Array<{ scheduleId: string }>;
        }
      | undefined;

    if (snapshot?.bookings && Array.isArray(snapshot.bookings)) {
      scheduleIdsToRestore = snapshot.bookings.map((b) => b.scheduleId);
      console.info(
        `[BOOKING_RECOVERY] Found ${scheduleIdsToRestore.length} bookings in deletedBookingsSnapshot`,
      );
    } else {
      const recoveryData = metadata.bookingRecoveryData as
        | {
            selectedScheduleIds?: string[];
          }
        | undefined;

      if (
        recoveryData?.selectedScheduleIds &&
        Array.isArray(recoveryData.selectedScheduleIds)
      ) {
        scheduleIdsToRestore = recoveryData.selectedScheduleIds;
        console.info(
          `[BOOKING_RECOVERY] Found ${scheduleIdsToRestore.length} scheduleIds in bookingRecoveryData`,
        );
      }
    }

    if (scheduleIdsToRestore.length === 0) {
      console.info(`[BOOKING_RECOVERY] No schedule data found in metadata`);
      return;
    }

    // 4. Get valid future schedules with available spots
    const now = new Date();
    const validSchedules = await db.schedule.findMany({
      where: {
        id: { in: scheduleIdsToRestore },
        date: { gte: now },
        availableSpots: { gt: 0 },
      },
      select: {
        id: true,
        availableSpots: true,
        date: true,
        time: true,
        classId: true,
        class: { select: { price: true } },
      },
    });

    if (validSchedules.length === 0) {
      console.info(
        `[BOOKING_RECOVERY] No valid future schedules with available spots found`,
      );
      return;
    }

    console.info(
      `[BOOKING_RECOVERY] Restoring ${validSchedules.length} bookings (${scheduleIdsToRestore.length - validSchedules.length} skipped - full/past/missing)`,
    );

    let restoredCount = 0;
    let skippedCount = 0;

    // 5. Restore each booking with row-level locking
    for (const schedule of validSchedules) {
      try {
        await db.$transaction(async (tx) => {
          // LOCK -> DUPLICATE CHECK -> SPOT CHECK -> CREATE -> DECREMENT

          // Step 1: Lock schedule row first (forces serialization)
          await tx.$queryRaw`
            SELECT \`id\`, \`availableSpots\`
            FROM \`Schedule\`
            WHERE \`id\` = ${schedule.id}
            FOR UPDATE
          `;

          // Step 2: Check for existing booking AFTER acquiring lock
          const existing = await tx.booking.findFirst({
            where: {
              userId,
              scheduleId: schedule.id,
              userMembershipId,
            },
          });

          if (existing) {
            console.info(
              `[BOOKING_RECOVERY] Booking already exists for schedule ${schedule.id} - skip`,
            );
            skippedCount++;
            return;
          }

          // Step 3: Check spot availability AFTER lock
          const currentSchedule = await tx.schedule.findUnique({
            where: { id: schedule.id },
            select: { availableSpots: true },
          });

          if (!currentSchedule || currentSchedule.availableSpots <= 0) {
            console.info(
              `[BOOKING_RECOVERY] Schedule ${schedule.id} no longer has spots - skip`,
            );
            skippedCount++;
            return;
          }

          // Step 4: Create booking
          await tx.booking.create({
            data: {
              userId,
              scheduleId: schedule.id,
              userMembershipId,
              status: "confirmed",
              paidAmount: schedule.class.price,
            },
          });

          // Step 5: Decrement available spots
          await tx.schedule.update({
            where: { id: schedule.id },
            data: { availableSpots: { decrement: 1 } },
          });

          restoredCount++;
        });
      } catch (error: any) {
        console.error(
          `[BOOKING_RECOVERY] Failed to restore booking for schedule ${schedule.id}:`,
          error.message,
        );
        skippedCount++;
      }
    }

    console.info(
      `[BOOKING_RECOVERY] Restoration complete: ${restoredCount} restored, ${skippedCount} skipped`,
    );
  } catch (error: any) {
    // NON-FATAL: Log error but don't throw - payment recovery must succeed
    console.error(
      `[BOOKING_RECOVERY] Booking restoration failed (non-fatal):`,
      error.message,
    );
  }
}

/**
 * Recovery function for payments already marked "paid" but with pending memberships.
 * This handles the bug where PaymentTransaction.status="paid" but
 * UserMembership.status="pending_payment" due to the deleted redundant claim bug.
 *
 * WHEN TO USE:
 * - PaymentTransaction.status = "paid"
 * - UserMembership.status = "pending_payment"
 * - Payment already verified and confirmed
 * - Just need to activate the membership + run reconciliation
 *
 * SAFETY:
 * - Does NOT modify payment status (already paid)
 * - Uses existing activatePaidMembershipTx (atomic + idempotent)
 * - Runs post-activation reconciliation exactly once
 * - Idempotent: safe to retry
 */
export async function recoverPaidMembershipActivation(
  paymentTransactionId: string,
): Promise<ReturnType<typeof mapPaymentTransaction>> {
  const payment = await db.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
  });

  if (!payment) {
    throw new Error("Payment transaction not found");
  }

  if (payment.status !== "paid") {
    throw new Error(
      `Recovery rejected: Payment status is "${payment.status}", expected "paid"`,
    );
  }

  if (!payment.membershipId) {
    throw new Error("Recovery rejected: No membership linked to this payment");
  }

  const membership = await db.userMembership.findUnique({
    where: { id: payment.membershipId },
    select: { status: true },
  });

  if (!membership) {
    throw new Error("Recovery rejected: Membership not found");
  }

  if (
    membership.status !== "pending_payment" &&
    membership.status !== "active"
  ) {
    throw new Error(
      `Recovery rejected: Membership status is "${membership.status}", expected "pending_payment" or "active"`,
    );
  }

  console.info(
    `[RECOVERY] Activating paid membership ${payment.membershipId} for payment ${paymentTransactionId}`,
  );

  // Activate membership atomically
  let activationSucceeded = false;
  let membershipData: {
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
  } | null = null;

  await db.$transaction(async (tx) => {
    const result = await activatePaidMembershipTx(
      tx,
      paymentTransactionId,
      payment.membershipId!,
    );

    activationSucceeded = result.success;
    membershipData = result.membershipData;

    if (result.success && result.membershipData) {
      await ensureMembershipBookingsFromPaymentMetadataTx(tx, {
        userId: payment.userId,
        userMembershipId: payment.membershipId!,
        metadata: payment.metadata,
      });
    }
  });

  if (!activationSucceeded || !membershipData) {
    throw new Error("Recovery failed: Membership activation unsuccessful");
  }

  console.info(`[RECOVERY] Membership activation/booking guarantee completed`);

  console.info(`[RECOVERY] Running post-activation reconciliation`);

  // Run post-activation reconciliation (commissions, rewards, notifications, etc.)
  await runPaidMembershipPostActivationReconciliation({
    transactionId: paymentTransactionId,
    userId: payment.userId,
    userMembershipId: payment.membershipId,
    membershipData,
    paymentAmount: payment.amount,
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paidAt,
    transactionMetadata: payment.metadata,
  });

  void recordMembershipActivatedEvent(
    payment.membershipId,
    paymentTransactionId,
  ).catch(() => null);

  const recovered = await db.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
  });

  console.info(
    `[RECOVERY] Successfully recovered payment ${paymentTransactionId}`,
  );
  return mapPaymentTransaction(recovered!);
}

/**
 * Recover a verified Paymob payment with atomic validation and activation.
 *
 * CRITICAL SAFETY:
 * - Performs REMOTE Paymob verification BEFORE any local mutations
 * - Verifies transaction exists, is successful, and belongs to intention via Paymob API
 * - Uses intention ID (providerReference) as authoritative linkage
 * - Validates ALL payment details match expected values
 * - Uses SHARED activation helper (same logic as normal payment)
 * - Atomic claim: payment -> paid in ONE transaction with activation
 * - ALWAYS calls reconciliation (even if already paid/active) to handle crash-window
 * - Reconciliation is idempotent via row-lock + completion marker
 *
 * WHEN TO USE:
 * - Paymob dashboard shows "success" but webhook never arrived
 * - Customer paid but membership not activated
 * - ALL payment details manually verified through Paymob dashboard/API
 *
 * DO NOT USE FOR:
 * - Unverified payments
 * - Refunded/disputed/voided payments
 * - Payments where amount/currency don't match exactly
 */
export async function recoverVerifiedPaymobPayment(
  input: VerifiedPaymobRecoveryInput,
) {
  const {
    paymentTransactionId,
    paymobTransactionId,
    expectedAmount,
    expectedCurrency,
    expectedFitZoneReference,
    expectedIntentionId,
  } = input;

  // CRITICAL: Perform REMOTE Paymob verification BEFORE any local mutations
  // This ensures transaction exists, is successful, belongs to expected intention,
  // and matches all expected values
  console.info(
    "[RECOVERY] Verifying Paymob transaction remotely before recovery",
    {
      paymentTransactionId,
      paymobTransactionId,
      expectedIntentionId,
      expectedAmount,
      expectedCurrency,
    },
  );

  const paymobVerification = await verifyPaymobTransactionForRecovery(
    paymobTransactionId,
    paymentTransactionId, // Links to intention via special_reference
    expectedAmount,
    expectedCurrency,
    expectedFitZoneReference,
  );

  if (!paymobVerification.verified) {
    throw new Error(
      `Recovery rejected: Paymob remote verification failed - ${paymobVerification.failureReason ?? "transaction not verified"}`,
    );
  }

  console.info("[RECOVERY] Paymob remote verification passed", {
    transactionId: paymobVerification.transactionId,
    success: paymobVerification.success,
    pending: paymobVerification.pending,
    amount: paymobVerification.amountCents / 100,
    currency: paymobVerification.currency,
    sourceType: paymobVerification.sourceType,
  });

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

    // Validate intention ID matches (authoritative linkage for Unified Checkout)
    if (payment.providerReference !== expectedIntentionId) {
      throw new Error(
        `Recovery rejected: intention mismatch (expected ${expectedIntentionId}, found ${payment.providerReference ?? "none"})`,
      );
    }

    // Validate amount and currency match exactly (redundant with remote check, but belt-and-suspenders)
    if (
      payment.amount !== expectedAmount ||
      payment.currency.toUpperCase() !== expectedCurrency.toUpperCase()
    ) {
      throw new Error(
        `Recovery rejected: amount or currency mismatch (expected ${expectedAmount} ${expectedCurrency}, found ${payment.amount} ${payment.currency})`,
      );
    }

    // Validate FitZone reference matches
    if (payment.referenceCode !== expectedFitZoneReference) {
      throw new Error(
        `Recovery rejected: FitZone reference mismatch (expected ${expectedFitZoneReference}, found ${payment.referenceCode})`,
      );
    }

    // Check for conflicting external reference
    if (
      payment.externalReference &&
      payment.externalReference !== paymobTransactionId
    ) {
      throw new Error(
        `Recovery rejected: Paymob transaction ID ${paymobTransactionId} conflicts with existing evidence ${payment.externalReference}`,
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
        `Recovery rejected: duplicate paid payment exists for membership ${payment.membershipId} (payment ${duplicatePaid.id})`,
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

    const recoveryMetadata = parseJson(payment.metadata);
    const timeoutSnapshotRaw = recoveryMetadata?.deletedBookingsSnapshot;
    const timeoutSnapshot =
      timeoutSnapshotRaw && typeof timeoutSnapshotRaw === "object"
        ? (timeoutSnapshotRaw as Record<string, unknown>)
        : null;

    const isTimeoutCancelledRecovery =
      membership.status === "cancelled" &&
      payment.status === "cancelled" &&
      timeoutSnapshot?.reason === "timeout_cleanup" &&
      timeoutSnapshot?.userMembershipId === payment.membershipId;

    if (
      membership.status !== "pending_payment" &&
      membership.status !== "active" &&
      !isTimeoutCancelledRecovery
    ) {
      throw new Error(
        `Recovery rejected: membership ${payment.membershipId} is not recoverable (status: ${membership.status})`,
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
        `Recovery rejected: duplicate active membership exists for user ${membership.userId} / plan ${membership.membershipId}`,
      );
    }

    // Atomic claim: mark payment as paid (idempotent if already paid)
    let alreadyPaid = false;
    if (
      payment.status === "paid" &&
      payment.externalReference === paymobTransactionId
    ) {
      alreadyPaid = true;
    } else {
      const metadata = parseJson(payment.metadata);
      const claimed = await tx.paymentTransaction.updateMany({
        where: {
          id: paymentTransactionId,
          status: {
            in: isTimeoutCancelledRecovery
              ? [
                  "pending",
                  "pending_payment",
                  "processing",
                  "requires_action",
                  "cancelled",
                ]
              : ["pending", "pending_payment", "processing", "requires_action"],
          },
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
            paymobRemoteVerification: {
              verified: paymobVerification.verified,
              transactionId: paymobVerification.transactionId,
              success: paymobVerification.success,
              pending: paymobVerification.pending,
              amountCents: paymobVerification.amountCents,
              currency: paymobVerification.currency,
              sourceType: paymobVerification.sourceType,
              verifiedAt: new Date().toISOString(),
            },
          }),
        },
      });

      if (claimed.count === 0) {
        throw new Error(
          `Payment ${paymentTransactionId} already processed or in terminal state`,
        );
      }
    }

    if (isTimeoutCancelledRecovery) {
      const reopened = await tx.userMembership.updateMany({
        where: {
          id: payment.membershipId,
          status: "cancelled",
        },
        data: {
          status: "pending_payment",
        },
      });

      if (reopened.count !== 1) {
        throw new Error(
          `Recovery rejected: timeout-cancelled membership ${payment.membershipId} changed concurrently`,
        );
      }
    }

    // Use SHARED activation helper (same logic as normal payment)
    const activation = await activatePaidMembershipTx(
      tx,
      paymentTransactionId,
      payment.membershipId,
    );

    if (!activation.success || !activation.membershipData) {
      throw new Error(`Membership ${payment.membershipId} activation failed`);
    }

    /*
     * Normal verified recovery uses the same recurring booking-plan engine as
     * subscribe and normal paid activation.
     *
     * Timeout-cancelled late payments are intentionally excluded here because
     * cleanup stored deletedBookingsSnapshot containing the exact reservations
     * that existed before timeout. That compatibility path is restored after
     * this transaction by restoreBookingsFromMetadata().
     */
    if (!isTimeoutCancelledRecovery) {
      await ensureMembershipBookingsFromPaymentMetadataTx(tx, {
        userId: payment.userId,
        userMembershipId: payment.membershipId,
        metadata: payment.metadata,
      });
    }

    // Refresh payment data
    const updatedPayment = await tx.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
    });

    return {
      alreadyPaid,
      isTimeoutCancelledRecovery,
      transaction: updatedPayment!,
      membershipData: activation.membershipData,
    };
  });

  if (result.isTimeoutCancelledRecovery) {
    await restoreBookingsFromMetadata(
      result.transaction.userId,
      result.transaction.membershipId!,
      result.transaction.metadata,
    );
  }

  // Record analytics event (fire-and-forget)
  void recordMembershipActivatedEvent(
    result.transaction.membershipId!,
    paymentTransactionId,
  ).catch(() => null);

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
